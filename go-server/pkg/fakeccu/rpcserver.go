package fakeccu

import (
	"bytes"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// The fake CCU (fakeccu.go): the XML-RPC server of the interfaces and the events it sends

func (c *CCU) handleXMLRPC(iface string, w http.ResponseWriter, r *http.Request) {
	method, params, err := decodeCall(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	result, fault := c.call(iface, method, params)
	if method == "updateFirmware" && c.FirmwareUpdateDelay > 0 {
		// rfd answers only after transferring and flashing (minutes)
		time.Sleep(c.FirmwareUpdateDelay)
	}
	w.Header().Set("Content-Type", "text/xml")
	if fault != "" {
		// "-7:text" sends fault code -7
		code := -1
		if prefix, text, ok := strings.Cut(fault, ":"); ok {
			if n, err := strconv.Atoi(prefix); err == nil {
				code, fault = n, text
			}
		}
		_, _ = w.Write(toLatin1(encodeFault(code, fault)))
		return
	}
	// The result may hold the fixture's own maps (listDevices, getParamset):
	// encoded under the lock, as another call may change them meanwhile
	c.mu.Lock()
	body := encodeResponse(result)
	c.mu.Unlock()
	_, _ = w.Write(toLatin1(body))
}

func paramAt(params []any, i int) any {
	if i < len(params) {
		return params[i]
	}
	return nil
}

func stringParam(params []any, i int) string {
	if i < len(params) {
		s, _ := params[i].(string)
		return s
	}
	return ""
}

func (c *CCU) call(iface, name string, params []any) (any, string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.calls[iface+" "+name]++
	data := c.fixture.Interfaces[iface]
	if data == nil {
		data = &InterfaceData{}
		c.fixture.Interfaces[iface] = data
	}

	method, ok := rpcMethods[name]
	if !ok {
		return nil, "Unknown method " + name
	}
	return method(c, iface, data, params)
}

// ConfigPendingFor is how long a device with a maintenance channel takes
// to fetch new settings
var ConfigPendingFor = 3 * time.Second

// markConfigPending sets CONFIG_PENDING on the device's channel 0 for a
// while after its settings changed, as a battery device that still has to
// fetch them; c.mu must be held
func (c *CCU) markConfigPending(iface, device string) {
	ch := c.channelByAddress(iface, device+":0")
	if ch == nil {
		return
	}
	if _, ok := ch.Datapoints["CONFIG_PENDING"]; !ok {
		return
	}
	c.setValue(ch, "CONFIG_PENDING", true)
	time.AfterFunc(ConfigPendingFor, func() {
		c.mu.Lock()
		defer c.mu.Unlock()
		c.setValue(ch, "CONFIG_PENDING", false)
	})
}

// sendEvents delivers events to the callbacks one at a time, in order, as
// system.multicall like the CCU.
func (c *CCU) sendEvents() {
	client := &http.Client{Timeout: 5 * time.Second}
	for e := range c.events {
		call := encodeCall("system.multicall", []any{
			map[string]any{
				"methodName": "event",
				"params":     []any{e.interfaceID, e.address, e.datapoint, e.value},
			},
		})
		resp, err := client.Post(e.url, "text/xml", bytes.NewReader(toLatin1(call)))
		if err == nil {
			resp.Body.Close()
		}
	}
}
