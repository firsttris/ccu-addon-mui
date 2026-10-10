//go:build !lite

package websocket

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"time"

	"ccu-addon-mui-server/pkg/audit"
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

// handleSysvarChange creates, edits, renames and deletes system variables.
// All of it is setup.
func (s *Server) handleSysvarChange(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		ID        int64  `json:"id"`
		Name      string `json:"name"`
		rega.NewSysvar
		// editSysvar: the info text and the channel (0: none)
		Description string `json:"description"`
		Channel     int64  `json:"channel"`
	}
	if !s.decode(client, message, &msg) {
		return
	}
	target := fmt.Sprintf("sysvar %d", msg.ID)
	var created int64
	switch msgType {
	case "createSysvar":
		// The outer Name takes the JSON field; the embedded one stays empty
		sysvar := msg.NewSysvar
		sysvar.Name = msg.Name
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: msg.Kind, Value: msg.Name},
			func() (any, string, error) {
				result, id, err := s.regaClient.CreateSysvar(sysvar)
				created = id
				return nil, result, err
			}, &created)
	case "editSysvar":
		sysvar := msg.NewSysvar
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: target, Value: sysvar},
			func() (any, string, error) {
				result, err := s.regaClient.EditSysvar(msg.ID, sysvar, msg.Description, msg.Channel)
				return nil, result, err
			})
	case "renameSysvar":
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: target, Value: msg.Name},
			func() (any, string, error) {
				result, previous, err := s.regaClient.RenameSysvar(msg.ID, msg.Name)
				return previous, result, err
			})
	case "deleteSysvar":
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: target},
			func() (any, string, error) {
				result, previous, err := s.regaClient.DeleteSysvar(msg.ID)
				return previous, result, err
			})
	}
}
