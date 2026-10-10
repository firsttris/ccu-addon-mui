package websocket

import (
	"encoding/json"
	"fmt"
	"strconv"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/rega"
)

type setDatapointResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	Success   bool   `json:"success"`
	Error     string `json:"error,omitempty"`
	Code      string `json:"code,omitempty"`
}

func (s *Server) handleSetDatapoint(client *Client, message []byte) {
	var msg struct {
		Type          string      `json:"type"`
		RequestID     string      `json:"requestId"`
		InterfaceName string      `json:"interfaceName"`
		Address       string      `json:"address"`
		Attribute     string      `json:"attribute"`
		Value         interface{} `json:"value"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendError(client, "invalid setDatapoint message: "+err.Error())
		return
	}

	// Every outcome is answered with the requestId, so the client can undo
	// its optimistic update and tell the user, and recorded.
	entry := audit.Entry{
		User:   client.user,
		Action: "setDatapoint",
		Target: msg.InterfaceName + "." + msg.Address + "." + msg.Attribute,
		Value:  msg.Value,
	}
	record := func(result string) { s.recordAudit(entry, result) }
	fail := func(code, errorMsg string) {
		record(code)
		s.sendJSON(client, setDatapointResponse{
			Type: "setDatapoint_response", RequestID: msg.RequestID, Code: code, Error: errorMsg,
		})
	}

	if !canOperate(client.level) {
		fail("FORBIDDEN", "guests may not control devices")
		return
	}

	if msg.InterfaceName == "" || msg.Address == "" || msg.Attribute == "" {
		fail("INVALID_REQUEST", "interfaceName, address, and attribute are required")
		return
	}

	valueStr, err := formatValue(msg.Value)
	if err != nil {
		fail("INVALID_REQUEST", err.Error())
		return
	}

	// The WebUI's channel option "bedienbar": off, only administrators
	if !s.operable(client, msg.Address) {
		fail("FORBIDDEN", "only administrators may operate this channel")
		return
	}

	result, previous, err := s.homeFor(client).SetDatapoint(msg.InterfaceName, msg.Address, msg.Attribute, valueStr)
	if err != nil {
		fail("CCU_ERROR", "setDatapoint failed: "+err.Error())
		return
	}

	switch result {
	case rega.SetOK:
		entry.Previous = previous
		record(rega.SetOK)
		s.sendJSON(client, setDatapointResponse{Type: "setDatapoint_response", RequestID: msg.RequestID, Success: true})
	default:
		fail("NOT_FOUND", "datapoint not found")
	}
}

// formatValue converts a JSON value into the string form expected by
// rega.SetDatapoint. fmt's %v would turn large numbers into exponent notation
// (1e+06) and null into "<nil>".
func formatValue(v interface{}) (string, error) {
	switch x := v.(type) {
	case bool:
		return strconv.FormatBool(x), nil
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64), nil
	case string:
		return x, nil
	default:
		return "", fmt.Errorf("value must be a string, number or boolean")
	}
}
