package websocket

import (
	"bytes"
	"context"
	"encoding/json"
	"time"

	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
)

// System variables send no events: only device datapoints come from the
// interface processes over XML-RPC. The server therefore reads them every
// few seconds, once for all connections, and sends the list to the
// connections that show them when it changed. Before, every open app polled
// on its own; ReGa runs scripts one after another, so with several tablets
// that slowed down the WebUI and the programs.

// sysvarsMessage is sent unasked when the system variables changed
type sysvarsMessage struct {
	Type    string        `json:"type"`
	Sysvars []rega.Sysvar `json:"sysvars"`
}

// watchSysvars marks a connection that loaded the system variables (with
// getSysvars, so it may see them): it gets their changes from then on.
func (c *Client) watchSysvars(on bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sysvars = on
}

func (c *Client) watchesSysvars() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.sysvars
}

// RunSysvarWatch reads the system variables every interval while a
// connection shows them and sends them when they changed.
func (s *Server) RunSysvarWatch(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.pollSysvars()
		}
	}
}

func (s *Server) hasSysvarWatchers() bool {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()
	for client := range s.clients {
		if client.watchesSysvars() {
			return true
		}
	}
	return false
}

func (s *Server) pollSysvars() {
	if s.regaClient == nil {
		return
	}
	if !s.hasSysvarWatchers() {
		// Nobody looks: nothing to read. The next watcher loaded the list
		// itself; the first poll after that may send it once more.
		s.sysvarsMu.Lock()
		s.lastSysvars = nil
		s.sysvarsMu.Unlock()
		return
	}
	sysvars, err := s.regaClient.GetSysvars()
	if err != nil {
		logger.Debugf("Reading the system variables failed: %v", err)
		return
	}
	message, err := json.Marshal(sysvarsMessage{Type: "sysvars", Sysvars: sysvars})
	if err != nil {
		return
	}
	s.sysvarsMu.Lock()
	changed := !bytes.Equal(message, s.lastSysvars)
	s.lastSysvars = message
	s.sysvarsMu.Unlock()
	if !changed {
		return
	}

	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()
	for client := range s.clients {
		if !client.watchesSysvars() {
			continue
		}
		select {
		case client.send <- message:
		default:
			logger.Error("⚠️ Device " + client.DeviceID() + " buffer full, dropping system variables")
		}
	}
}
