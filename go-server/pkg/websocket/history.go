package websocket

import (
	"encoding/json"
	"strings"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
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
		// Only the entries of this channel
		Channel int64 `json:"channel"`
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
	entries, total, err := s.regaClient.GetHistory(msg.Start, msg.Count, msg.Channel)
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

type virtualKeysResponse struct {
	Type      string            `json:"type"`
	RequestID string            `json:"requestId,omitempty"`
	Keys      []rega.VirtualKey `json:"keys"`
}

// handleVirtualKeys lists the CCU's virtual keys; pressing them goes through
// setDatapoint (PRESS_SHORT, PRESS_LONG) like any key.
func (s *Server) handleVirtualKeys(client *Client, requestID string) {
	keys, err := s.regaClient.GetVirtualKeys()
	if err != nil {
		s.sendRequestError(client, requestID, "getVirtualKeys failed: "+err.Error(), "CCU_ERROR")
		return
	}
	s.sendJSON(client, virtualKeysResponse{Type: "getVirtualKeys_response", RequestID: requestID, Keys: keys})
}

type comTestResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	// startComTest: when the test started (its id)
	Started string `json:"started,omitempty"`
	// pollComTest: when the device answered, "" while it hasn't
	Answered string `json:"answered"`
}

// handleComTest starts a device's function test or checks it, as the
// WebUI's device dialog does (Device.startComTest, Device.pollComTest).
// Administrators, like the rest of the device page's setup.
func (s *Server) handleComTest(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		Address   string `json:"address"`
		Started   string `json:"started"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if client.level != auth.LevelAdmin {
		s.sendRequestError(client, msg.RequestID, "only administrators may test devices", "FORBIDDEN")
		return
	}
	var result, value string
	var err error
	if msgType == "startComTest" {
		result, value, err = s.regaClient.StartComTest(msg.Address)
	} else {
		result, value, err = s.regaClient.PollComTest(msg.Address, msg.Started)
	}
	if err != nil {
		code := "CCU_ERROR"
		if strings.HasPrefix(err.Error(), "invalid") {
			code = "INVALID_REQUEST"
		}
		s.sendRequestError(client, msg.RequestID, msgType+" failed: "+err.Error(), code)
		return
	}
	if result != rega.SetOK {
		s.sendRequestError(client, msg.RequestID, msgType+": "+result, result)
		return
	}
	response := comTestResponse{Type: msgType + "_response", RequestID: msg.RequestID}
	if msgType == "startComTest" {
		response.Started = value
	} else {
		response.Answered = value
	}
	s.sendJSON(client, response)
}
