package websocket

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
)

// How long the list of read-only channels is trusted; a change made here
// clears it at once
const readOnlyTTL = 30 * time.Second

// readOnlyChannels caches which channels non-administrators may not
// operate (the WebUI's "bedienbar" off).
type readOnlyChannels struct {
	mu        sync.Mutex
	addresses map[string]bool
	loaded    time.Time
}

func (r *readOnlyChannels) invalidate() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.addresses = nil
}

// operable says whether a non-administrator may operate the channel; if
// ReGa can't be asked, it refuses.
func (s *Server) operable(client *Client, address string) bool {
	if client.level == auth.LevelAdmin {
		return true
	}
	r := &s.readOnly
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.addresses == nil || time.Since(r.loaded) > readOnlyTTL {
		addresses, err := s.regaClient.GetReadOnlyChannels()
		if err != nil {
			return false
		}
		r.addresses, r.loaded = addresses, time.Now()
	}
	return !r.addresses[address]
}

// handleSetChannelOption sets visible, usable or logged of a channel, as
// the WebUI's channel configuration. Administrators only.
func (s *Server) handleSetChannelOption(client *Client, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		ID        int64  `json:"id"`
		Option    string `json:"option"`
		Value     bool   `json:"value"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	s.configure(client, msg.RequestID, audit.Entry{Action: "setChannelOption", Target: fmt.Sprintf("channel %d %s", msg.ID, msg.Option), Value: msg.Value},
		func() (interface{}, string, error) {
			result, _, err := s.regaClient.SetChannelOption(msg.ID, msg.Option, msg.Value)
			if msg.Option == "usable" {
				s.readOnly.invalidate()
			}
			return nil, result, err
		})
}
