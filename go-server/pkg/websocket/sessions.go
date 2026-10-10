package websocket

import (
	"encoding/json"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/rega"
)

type sessionInfo struct {
	auth.SessionInfo
	// Current: this connection's device
	Current bool `json:"current"`
}

type sessionsResponse struct {
	Type      string        `json:"type"`
	RequestID string        `json:"requestId,omitempty"`
	Success   bool          `json:"success"`
	Sessions  []sessionInfo `json:"sessions,omitempty"`
}

// handleSessions: the list of logged-in devices (administrators), logging
// one out, and logging out this device itself (everyone).
func (s *Server) handleSessions(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		ID        string `json:"id"`
	}
	_ = json.Unmarshal(message, &msg)
	if s.auth == nil {
		s.sendRequestError(client, msg.RequestID, "authentication is disabled", "NOT_AVAILABLE")
		return
	}

	switch msgType {
	case "logout":
		if id := client.SessionID(); id != "" {
			s.auth.Revoke(id)
			// Other tabs of this device
			s.disconnectSession(id, client)
		}
		s.endWebUISession(client.user)
		client.watchSysvars(false)
		client.unwatchMessages()
		if s.auth != nil {
			// This connection is logged out too, not only the others
			client.setSession("", auth.LevelUnknown)
			client.authenticated = false
			client.setSessionID("")
		}
		s.sendJSON(client, sessionsResponse{Type: "logout_response", RequestID: msg.RequestID, Success: true})
	case "listSessions":
		if code, errorMsg := configureError(client); code != "" {
			s.sendRequestError(client, msg.RequestID, errorMsg, code)
			return
		}
		list := []sessionInfo{}
		for _, info := range s.auth.Sessions() {
			list = append(list, sessionInfo{SessionInfo: info, Current: info.ID == client.SessionID()})
		}
		s.sendJSON(client, sessionsResponse{Type: "listSessions_response", RequestID: msg.RequestID, Success: true, Sessions: list})
	case "revokeSession":
		s.configure(client, msg.RequestID, audit.Entry{Action: "revokeSession", Target: msg.ID}, func() (interface{}, string, error) {
			if !s.auth.Revoke(msg.ID) {
				return nil, rega.SetNotFound, nil
			}
			s.disconnectSession(msg.ID, client)
			return nil, rega.SetOK, nil
		})
	}
}

// endWebUISession logs out the WebUI session kept for a user, if any
func (s *Server) endWebUISession(user string) {
	if s.backup != nil && user != "" {
		s.backup.EndWebUISession(user)
	}
}

// disconnectSession closes the connections of a logged-out device (except
// the one asking): they reconnect and are asked to log in.
func (s *Server) disconnectSession(id string, except *Client) {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()
	for c := range s.clients {
		if c != except && c.SessionID() == id && c.conn != nil {
			_ = c.conn.Close()
		}
	}
}
