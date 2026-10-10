package websocket

import (
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

type messageRequest struct {
	RequestID string `json:"requestId"`
	ID        int64  `json:"id"`
}

// handleServiceMessages lists the CCU's service messages and alarms and
// acknowledges them. Acknowledging is operating, like in the WebUI: not
// for guests.
func (s *Server) handleServiceMessages(client *Client, msgType string, message []byte) {
	var msg messageRequest
	if !s.decode(client, message, &msg) {
		return
	}
	switch msgType {
	case "getServiceMessages":
		s.getServiceMessages(client, msg)
	case "getAlarmMessages":
		s.getAlarmMessages(client, msg)
	case "acknowledgeServiceMessage":
		s.acknowledgeMessage(client, msgType, fmt.Sprintf("service message %d", msg.ID), msg,
			func(id int64) (string, string, error) { return s.homeFor(client).AcknowledgeServiceMessage(id) })
	case "acknowledgeAlarmMessage":
		s.acknowledgeMessage(client, msgType, fmt.Sprintf("alarm %d", msg.ID), msg, s.acknowledgeAlarm)
	}
}

func (s *Server) getServiceMessages(client *Client, msg messageRequest) {
	messages, err := s.readServiceMessages(0)
	if err != nil {
		s.sendRequestError(client, msg.RequestID, "getServiceMessages failed: "+err.Error(), "CCU_ERROR")
		return
	}
	client.watchMessages(false)
	s.sendJSON(client, serviceMessagesResponse{Type: "getServiceMessages_response", RequestID: msg.RequestID, Messages: s.hideStickyUnreach(messages)})
}

func (s *Server) getAlarmMessages(client *Client, msg messageRequest) {
	alarms, err := s.readAlarms(0)
	if err != nil {
		s.sendRequestError(client, msg.RequestID, "getAlarmMessages failed: "+err.Error(), "CCU_ERROR")
		return
	}
	client.watchMessages(true)
	s.sendJSON(client, alarmMessagesResponse{Type: "getAlarmMessages_response", RequestID: msg.RequestID, Alarms: alarms})
}

// acknowledgeMessage acknowledges a service message or an alarm; the audit
// log keeps the message's type
func (s *Server) acknowledgeMessage(client *Client, msgType, target string, msg messageRequest,
	acknowledge func(id int64) (result, messageType string, err error)) {
	s.operate(client, msg.RequestID, audit.Entry{Action: msgType, Target: target},
		func() (any, string, error) {
			result, messageType, err := acknowledge(msg.ID)
			return messageType, result, err
		})
}
