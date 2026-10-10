package websocket

import (
	"time"

	"ccu-addon-mui-server/pkg/auth"
)

// How long the list of read-only channels is trusted; a change made here
// clears it at once
const readOnlyTTL = 30 * time.Second

// operable says whether a non-administrator may operate the channel; if
// ReGa can't be asked, it refuses.
func (s *Server) operable(client *Client, address string) bool {
	if client.level == auth.LevelAdmin {
		return true
	}
	addresses, err := s.readOnly.get(readOnlyTTL, s.home.GetReadOnlyChannels)
	if err != nil {
		return false
	}
	return !addresses[address]
}
