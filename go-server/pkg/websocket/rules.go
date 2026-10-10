package websocket

import (
	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/rules"
)

// SetRules enables the notification rules
func (s *Server) SetRules(store *rules.Store, engine *rules.Engine) {
	s.rules = store
	s.ruleRun = engine
}

type rulesResponse struct {
	Type      string       `json:"type"`
	RequestID string       `json:"requestId,omitempty"`
	Rules     []rules.Rule `json:"rules"`
}

type ruleResponse struct {
	Type      string     `json:"type"`
	RequestID string     `json:"requestId,omitempty"`
	Success   bool       `json:"success"`
	Rule      rules.Rule `json:"rule"`
}

// handleRules shows the notification rules to everyone logged in and lets
// administrators change them (elevated, with audit log). Who is notified
// each device chooses itself (subscribePush rules).
func (s *Server) handleRules(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string     `json:"requestId"`
		Rule      rules.Rule `json:"rule"`
		ID        string     `json:"id"`
	}
	if !s.decode(client, message, &msg) {
		return
	}
	if s.rules == nil {
		s.sendRequestError(client, msg.RequestID, "notification rules are not available", "NOT_SUPPORTED")
		return
	}
	switch msgType {
	case "getRules":
		s.sendJSON(client, rulesResponse{Type: "getRules_response", RequestID: msg.RequestID, Rules: s.rules.List()})
	case "saveRule":
		entry := audit.Entry{User: client.user, Action: "saveRule", Target: msg.Rule.Name, Value: msg.Rule}
		if !s.mayConfigure(client, msg.RequestID, entry) {
			return
		}
		saved, previous, err := s.rules.Save(msg.Rule)
		if err != nil {
			s.failChange(client, msg.RequestID, entry, err)
			return
		}
		if previous != nil {
			entry.Previous = previous
		}
		entry.Value = saved
		s.recordAudit(entry, rega.SetOK)
		s.ruleChanged(saved.ID)
		s.sendJSON(client, ruleResponse{Type: "saveRule_response", RequestID: msg.RequestID, Success: true, Rule: saved})
	case "deleteRule":
		entry := audit.Entry{User: client.user, Action: "deleteRule", Target: msg.ID}
		if !s.mayConfigure(client, msg.RequestID, entry) {
			return
		}
		previous, err := s.rules.Delete(msg.ID)
		if err != nil {
			s.failChange(client, msg.RequestID, entry, err)
			return
		}
		entry.Previous = previous
		entry.Target = previous.Name
		s.recordAudit(entry, rega.SetOK)
		s.ruleChanged(previous.ID)
		s.sendJSON(client, changeResponse{Type: "deleteRule_response", RequestID: msg.RequestID, Success: true})
	}
}

// ruleChanged lets a changed rule start over and evaluates it with the
// current values
func (s *Server) ruleChanged(id string) {
	if s.ruleRun != nil {
		s.ruleRun.Reset(id)
		go s.ruleRun.Evaluate()
	}
}
