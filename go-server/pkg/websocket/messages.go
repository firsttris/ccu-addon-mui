package websocket

import (
	"encoding/json"
	"fmt"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/rega"
)

type alarmMessagesResponse struct {
	Type      string              `json:"type"`
	RequestID string              `json:"requestId,omitempty"`
	Alarms    []rega.AlarmMessage `json:"alarms"`
}

type serviceMessagesResponse struct {
	Type      string                `json:"type"`
	RequestID string                `json:"requestId,omitempty"`
	Messages  []rega.ServiceMessage `json:"messages"`
}

// handleServiceMessages lists the CCU's service messages and acknowledges
// them. Acknowledging is operating, like in the WebUI: not for guests.
func (s *Server) handleServiceMessages(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		ID        int64  `json:"id"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	switch msgType {
	case "getServiceMessages":
		messages, err := s.readServiceMessages(0)
		if err != nil {
			s.sendRequestError(client, msg.RequestID, "getServiceMessages failed: "+err.Error(), "CCU_ERROR")
			return
		}
		client.watchMessages(false)
		s.sendJSON(client, serviceMessagesResponse{Type: "getServiceMessages_response", RequestID: msg.RequestID, Messages: s.hideStickyUnreach(messages)})
		return
	case "getAlarmMessages":
		alarms, err := s.readAlarms(0)
		if err != nil {
			s.sendRequestError(client, msg.RequestID, "getAlarmMessages failed: "+err.Error(), "CCU_ERROR")
			return
		}
		client.watchMessages(true)
		s.sendJSON(client, alarmMessagesResponse{Type: "getAlarmMessages_response", RequestID: msg.RequestID, Alarms: alarms})
		return
	}
	alarm := msgType == "acknowledgeAlarmMessage"
	target := fmt.Sprintf("service message %d", msg.ID)
	if alarm {
		target = fmt.Sprintf("alarm %d", msg.ID)
	}
	entry := audit.Entry{User: client.user, Action: msgType, Target: target}
	finish := func(result string) { s.recordAudit(entry, result) }
	if !canOperate(client.level) {
		finish("FORBIDDEN")
		s.sendRequestError(client, msg.RequestID, "guests may not acknowledge messages", "FORBIDDEN")
		return
	}
	acknowledge := s.homeFor(client).AcknowledgeServiceMessage
	if alarm {
		acknowledge = s.regaClient.AcknowledgeAlarmMessage
	}
	result, messageType, err := acknowledge(msg.ID)
	if err != nil {
		finish("CCU_ERROR")
		s.sendRequestError(client, msg.RequestID, msgType+" failed: "+err.Error(), "CCU_ERROR")
		return
	}
	entry.Previous = messageType
	finish(result)
	if result != rega.SetOK {
		s.sendRequestError(client, msg.RequestID, msgType+": "+result, result)
		return
	}
	s.sendJSON(client, changeResponse{Type: msgType + "_response", RequestID: msg.RequestID, Success: true})
}
