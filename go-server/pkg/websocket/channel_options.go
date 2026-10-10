package websocket

import (
	"sync"
	"time"

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
		addresses, err := s.home.GetReadOnlyChannels()
		if err != nil {
			return false
		}
		r.addresses, r.loaded = addresses, time.Now()
	}
	return !r.addresses[address]
}
