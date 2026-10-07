package occulite

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"ccu-addon-mui-server/pkg/logger"
)

// StateEntry is a datapoint's last value in openccu-lite's state store
// (GET /api/rpc/v1/state, occulited docs/system-api.md "lite-rpc")
type StateEntry struct {
	Interface string      `json:"interface"`
	Address   string      `json:"address"`
	Datapoint string      `json:"datapoint"`
	Value     interface{} `json:"value"`
	// When the value last changed (RFC 3339)
	LC string `json:"lc"`
	// false for a value restored after a restart and not reported since
	Confirmed bool `json:"confirmed"`
}

// State reads the whole state store, page by page, and the event stream's
// position taken before the read: opened there, the stream loses nothing
func (c *Client) State(ctx context.Context) ([]StateEntry, string, error) {
	var all []StateEntry
	eventID, after := "", ""
	for {
		path := "/api/rpc/v1/state?limit=5000"
		if after != "" {
			path += "&after=" + url.QueryEscape(after)
		}
		var page struct {
			Entries []StateEntry `json:"entries"`
			Next    string       `json:"next"`
			EventID string       `json:"event_id"`
		}
		if err := c.do(ctx, http.MethodGet, path, "", nil, &page); err != nil {
			return nil, "", err
		}
		if eventID == "" {
			eventID = page.EventID
		}
		all = append(all, page.Entries...)
		if page.Next == "" {
			return all, eventID, nil
		}
		after = page.Next
	}
}

// StreamMessage is one message of lite-rpc's event stream: event (a
// datapoint reported), state (the store's sweep found a value), the
// device lists changed (newDevices, deleteDevices, updateDevice,
// replaceDevice, readdedDevice), interface (a process went up or down) or
// resync (events were lost: read the state again)
type StreamMessage struct {
	ID   string
	Kind string
	Data StreamData
}

// StreamData is the payload of a stream message
type StreamData struct {
	Interface string      `json:"interface"`
	Address   string      `json:"address"`
	Key       string      `json:"key"`
	Datapoint string      `json:"datapoint"`
	Value     interface{} `json:"value"`
	Addresses []string    `json:"addresses"`
	Reason    string      `json:"reason"`
	State     string      `json:"state"`
}

// Stream follows lite-rpc's event stream (GET /api/rpc/v1/events, SSE)
// until ctx ends, from lastID on, and opens it again after a break: with
// the last id it saw, so the server replays what was missed (5 minutes),
// or answers resync. Instead of a callback server for the interfaces' init.
func (c *Client) Stream(ctx context.Context, lastID string, handle func(StreamMessage)) {
	backoff := time.Second
	for ctx.Err() == nil {
		started := time.Now()
		id, err := c.stream(ctx, lastID, handle)
		if id != "" {
			lastID = id
		}
		if ctx.Err() != nil {
			return
		}
		if time.Since(started) > time.Minute {
			backoff = time.Second
		}
		logger.Debugf("openccu-lite event stream ended (%v), again in %s", err, backoff)
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
}

func (c *Client) stream(ctx context.Context, lastID string, handle func(StreamMessage)) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/api/rpc/v1/events", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "text/event-stream")
	if token := c.token(); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if lastID != "" {
		req.Header.Set("Last-Event-ID", lastID)
	}
	// No timeout: the stream runs as long as ctx; a dead connection shows
	// as silence, the server pings every 15 s
	resp, err := (&http.Client{Transport: c.HTTP.Transport}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("status %d", resp.StatusCode)
	}
	// 45 s without a byte (not even the ping) is a dead connection
	alive := make(chan struct{}, 1)
	watchCtx, stop := context.WithCancel(ctx)
	defer stop()
	go func() {
		for {
			select {
			case <-watchCtx.Done():
				return
			case <-alive:
			case <-time.After(45 * time.Second):
				resp.Body.Close()
				return
			}
		}
	}()

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 64*1024), 4<<20)
	var message StreamMessage
	var data strings.Builder
	seen := lastID
	for scanner.Scan() {
		select {
		case alive <- struct{}{}:
		default:
		}
		line := scanner.Text()
		switch {
		case line == "":
			if message.Kind != "" && data.Len() > 0 {
				if err := json.Unmarshal([]byte(data.String()), &message.Data); err == nil {
					handle(message)
				}
				if message.ID != "" {
					seen = message.ID
				}
			}
			message, data = StreamMessage{}, strings.Builder{}
		case strings.HasPrefix(line, ":"):
			// comment: connected, ping
		case strings.HasPrefix(line, "id:"):
			message.ID = strings.TrimSpace(line[3:])
		case strings.HasPrefix(line, "event:"):
			message.Kind = strings.TrimSpace(line[6:])
		case strings.HasPrefix(line, "data:"):
			data.WriteString(strings.TrimPrefix(line[5:], " "))
		}
	}
	return seen, scanner.Err()
}
