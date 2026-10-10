//go:build !lite

package websocket

import (
	"fmt"

	"ccu-addon-mui-server/pkg/audit"
)

// invalidate forgets the read-only channels after one was changed here
// (only the CCU's channel options change them)
func (r *readOnlyChannels) invalidate() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.addresses = nil
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
	if !s.decode(client, message, &msg) {
		return
	}
	s.configure(client, msg.RequestID, audit.Entry{Action: "setChannelOption", Target: fmt.Sprintf("channel %d %s", msg.ID, msg.Option), Value: msg.Value},
		func() (any, string, error) {
			result, _, err := s.regaClient.SetChannelOption(msg.ID, msg.Option, msg.Value)
			if msg.Option == "usable" {
				s.readOnly.invalidate()
			}
			return nil, result, err
		})
}
