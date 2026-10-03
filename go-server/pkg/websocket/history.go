package websocket

import (
	"encoding/json"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/rega"
)

type historyResponse struct {
	Type      string              `json:"type"`
	RequestID string              `json:"requestId,omitempty"`
	Entries   []rega.HistoryEntry `json:"entries"`
	Total     int                 `json:"total"`
}

// handleHistory reads the system protocol, which everyone logged in may see
// (the WebUI shows it under Status und Bedienung), or clears it
// (administrators, with audit log).
func (s *Server) handleHistory(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		Start     int    `json:"start"`
		Count     int    `json:"count"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if msgType == "clearHistory" {
		s.configure(client, msg.RequestID, audit.Entry{Action: "clearHistory", Target: "system protocol"},
			func() (interface{}, string, error) {
				result, err := s.regaClient.ClearHistory()
				return nil, result, err
			})
		return
	}
	if msg.Count == 0 {
		msg.Count = 100
	}
	entries, total, err := s.regaClient.GetHistory(msg.Start, msg.Count)
	if err != nil {
		code := "CCU_ERROR"
		if err.Error() == "invalid range" {
			code = "INVALID_REQUEST"
		}
		s.sendRequestError(client, msg.RequestID, "getHistory failed: "+err.Error(), code)
		return
	}
	s.sendJSON(client, historyResponse{Type: "getHistory_response", RequestID: msg.RequestID, Entries: entries, Total: total})
}

type deviceProgramsResponse struct {
	Type      string              `json:"type"`
	RequestID string              `json:"requestId,omitempty"`
	Programs  []rega.ProgramUsage `json:"programs"`
}

// handleDevicePrograms lists the programs that use a channel of a device,
// as the WebUI's "Programme" button in the device list; like the program
// list, everyone logged in may see it.
func (s *Server) handleDevicePrograms(client *Client, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		Address   string `json:"address"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	programs, err := s.regaClient.GetDevicePrograms(msg.Address)
	if err != nil {
		code := "CCU_ERROR"
		if err.Error() == "invalid address" {
			code = "INVALID_REQUEST"
		}
		s.sendRequestError(client, msg.RequestID, "getDevicePrograms failed: "+err.Error(), code)
		return
	}
	s.sendJSON(client, deviceProgramsResponse{Type: "getDevicePrograms_response", RequestID: msg.RequestID, Programs: programs})
}
