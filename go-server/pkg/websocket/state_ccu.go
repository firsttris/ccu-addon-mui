//go:build !lite

package websocket

import (
	"sync"
	"time"

	"ccu-addon-mui-server/pkg/logs"
	"ccu-addon-mui-server/pkg/rega"
)

// ccuState is the part of the Server only a CCU fills: its logs, the
// system variables of its ReGa and its users (state_lite.go is empty)
type ccuState struct {
	logs *logs.Service
	// The system variables last sent to the connections (sysvars.go)
	lastSysvars []byte
	sysvarsMu   sync.Mutex
	// The CCU's users, for the automatic login: read at most once a minute,
	// as every connection without a token asks
	autoLoginUsers cached[[]rega.User]
}

// forget drops the kept value: the next get reads it again (only the CCU
// forgets one: its users after a change, its read-only channels)
func (c *cached[T]) forget() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.at = time.Time{}
}
