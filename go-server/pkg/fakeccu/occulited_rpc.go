package fakeccu

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// The fake openccu-lite's lite-rpc: the interfaces' calls with the rights
// of the session, the state store, the event stream and service messages
// (occulited.go routes the requests)

type liteEvent struct {
	id   int
	kind string
	data []byte
}

// publishLite adds a message to the event stream; c.mu is held
func (c *CCU) publishLite(kind string, data any) {
	encoded, _ := json.Marshal(data)
	event := liteEvent{id: len(c.liteEvents) + 1, kind: kind, data: encoded}
	c.liteEvents = append(c.liteEvents, event)
	for stream := range c.liteStreams {
		select {
		case stream <- event:
		default:
		}
	}
}

// The state store: every value of the fixture's channels
func (c *CCU) handleLiteState(w http.ResponseWriter) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entries := []map[string]any{}
	for _, ch := range c.fixture.Channels {
		for key, value := range ch.Datapoints {
			entries = append(entries, map[string]any{
				"interface": ch.Interface, "address": ch.Address, "datapoint": key, "value": value,
				"lc": c.Started.Format(time.RFC3339), "confirmed": true, "source": "event",
			})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"entries": entries, "total": len(entries), "unconfirmed": 0,
		"event_id": fmt.Sprintf("fake-%d", len(c.liteEvents)),
	})
}

// The event stream (SSE), replayed from Last-Event-ID
func (c *CCU) handleLiteEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "no streaming", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.WriteHeader(http.StatusOK)
	write := func(e liteEvent) {
		// resync is not in the ring: no id, as occulited
		if e.id > 0 {
			fmt.Fprintf(w, "id: fake-%d\n", e.id)
		}
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", e.kind, e.data)
		flusher.Flush()
	}
	fmt.Fprint(w, ": connected\n\n")
	stream := make(chan liteEvent, 256)
	c.mu.Lock()
	last, _ := strconv.Atoi(strings.TrimPrefix(r.Header.Get("Last-Event-ID"), "fake-"))
	missed := append([]liteEvent{}, c.liteEvents[min(last, len(c.liteEvents)):]...)
	if c.liteStreams == nil {
		c.liteStreams = map[chan liteEvent]bool{}
	}
	c.liteStreams[stream] = true
	c.mu.Unlock()
	defer func() {
		c.mu.Lock()
		delete(c.liteStreams, stream)
		c.mu.Unlock()
	}()
	for _, e := range missed {
		write(e)
	}
	flusher.Flush()
	for {
		select {
		case <-r.Context().Done():
			return
		case e := <-stream:
			write(e)
		case <-time.After(15 * time.Second):
			fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		}
	}
}

// LiteResync sends resync on lite-rpc's event stream, as occulited does when
// a client lost events it cannot replay: without an id
func (c *CCU) LiteResync(reason string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	data, _ := json.Marshal(map[string]string{"reason": reason})
	for stream := range c.liteStreams {
		select {
		case stream <- liteEvent{kind: "resync", data: data}:
		default:
		}
	}
}

// The service messages occulited collects: the active maintenance
// datapoints of the fixture's channels 0, as the CCU's list has them
func (c *CCU) handleLiteServiceMessages(w http.ResponseWriter) {
	c.mu.Lock()
	defer c.mu.Unlock()
	messages := []map[string]any{}
	for _, m := range c.serviceMessages() {
		device := deviceAddress(m.channel.Address)
		messages = append(messages, map[string]any{
			"interface": m.channel.Interface, "address": device, "channel": m.channel.Address, "key": m.datapoint,
			"value": m.channel.Datapoints[m.datapoint], "since": "2026-01-15T09:00:00Z", "seen": "2026-01-15T09:00:00Z",
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"count": len(messages), "messages": messages, "swept": true, "errors": []string{}})
}

// virtualKeyValues: a virtual key's VALUES (PRESS_SHORT, PRESS_LONG)
var virtualKeyValues = map[string]any{
	"PRESS_SHORT": map[string]any{"TYPE": "ACTION", "OPERATIONS": 6, "FLAGS": 1, "DEFAULT": false},
	"PRESS_LONG":  map[string]any{"TYPE": "ACTION", "OPERATIONS": 6, "FLAGS": 1, "DEFAULT": false},
}

// virtualKeyDevices are the central's HM-RCV-50 and HmIP-RCV-50 with the
// fixture's virtual keys as their channels; c.mu is held
func (c *CCU) virtualKeyDevices(iface string) []map[string]any {
	var devices []map[string]any
	byParent := map[string][]string{}
	for _, ch := range c.fixture.Channels {
		if ch.Interface == iface && isVirtualKey(ch.Address) {
			parent, _, _ := strings.Cut(ch.Address, ":")
			byParent[parent] = append(byParent[parent], ch.Address)
		}
	}
	for parent, children := range byParent {
		kind := "HM-RCV-50"
		if parent == "HmIP-RCV-1" {
			kind = "HmIP-RCV-50"
		}
		devices = append(devices, map[string]any{"ADDRESS": parent, "TYPE": kind, "CHILDREN": children, "PARAMSETS": []any{"MASTER"}, "FLAGS": 1, "VERSION": 1})
		for _, address := range children {
			_, index, _ := strings.Cut(address, ":")
			n, _ := strconv.Atoi(index)
			devices = append(devices, map[string]any{
				"ADDRESS": address, "TYPE": "VIRTUAL_KEY", "PARENT": parent, "PARENT_TYPE": kind,
				"INDEX": n, "FLAGS": 1, "VERSION": 1, "PARAMSETS": []any{"MASTER", "VALUES", "LINK"},
			})
		}
	}
	return devices
}

var liteMethodName = regexp.MustCompile(`<methodName>\s*([^<\s]+)\s*</methodName>`)

// liteRPCTier is the level a lite-rpc call needs (occulited
// docs/lite-rpc-methods.json, abridged): 1 read, 2 operate, 3 configure,
// 4 administer
func liteRPCTier(method string) int {
	switch method {
	case "deleteDevice", "replaceDevice", "installFirmware", "updateFirmware", "changeKey", "changeDevice", "resetDevice", "restoreConfigToDevice":
		return 4
	case "setValue":
		return 2
	}
	for _, prefix := range []string{"get", "list", "ping", "rssiInfo", "system.", "refreshDeployedDeviceFirmwareList"} {
		if strings.HasPrefix(method, prefix) {
			return 1
		}
	}
	return 3
}

var liteLevelRank = map[string]int{"read": 1, "operate": 2, "configure": 3, "administer": 4}

// lite-rpc: POST /api/rpc/v1/xmlrpc/{interface} forwards one XML-RPC call to
// the interface process when the credential's level allows the method; a
// refusal is a fault -1 over 200, as occulited answers it. The add-on's
// token passes every tier here.
func (c *CCU) handleLiteRPC(w http.ResponseWriter, r *http.Request) {
	iface := strings.TrimPrefix(r.URL.Path, "/api/rpc/v1/xmlrpc/")
	if _, ok := c.InterfacePorts[iface]; !ok {
		apiError(w, http.StatusNotFound, "unknown-interface", iface)
		return
	}
	body, _ := io.ReadAll(r.Body)
	method := ""
	if m := liteMethodName.FindSubmatch(body); m != nil {
		method = string(m[1])
	}
	user, level, _, _ := c.liteSession(r)
	c.mu.Lock()
	c.calls["lite-rpc "+iface+" "+method]++
	c.calls["lite-rpc "+user+" "+method]++
	c.mu.Unlock()
	if level != "" && liteLevelRank[level] < liteRPCTier(method) {
		w.Header().Set("Content-Type", "text/xml")
		_, _ = w.Write(toLatin1(encodeFault(-1, method+" needs a higher level than "+level)))
		return
	}
	r.Body = io.NopCloser(bytes.NewReader(body))
	c.handleXMLRPC(iface, w, r)
}
