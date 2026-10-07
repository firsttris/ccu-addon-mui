//go:build !lite

package websocket

import (
	"encoding/json"
	"errors"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/settings"
)

type firewallResponse struct {
	Type      string            `json:"type"`
	RequestID string            `json:"requestId,omitempty"`
	Firewall  settings.Firewall `json:"firewall"`
}

// handleFirewall shows and changes the CCU's firewall, as the WebUI's
// FirewallConfigDialog: the mode, the access to the XML-RPC API, the
// script API and the mediola NEO server, the addresses for restricted
// access and extra ports. It is read from firewall.conf and set through
// Firewall.setConfiguration, which applies it at once
// (libfirewall.tcl); for administrators, elevated, with audit log and the
// kept WebUI session (PASSWORD_REQUIRED).
func (s *Server) handleFirewall(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string            `json:"requestId"`
		Firewall  settings.Firewall `json:"firewall"`
		Password  string            `json:"password"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if client.level != auth.LevelAdmin {
		s.sendRequestError(client, msg.RequestID, "only administrators may see the firewall", "FORBIDDEN")
		return
	}
	if s.settings == nil || s.backup == nil {
		s.sendRequestError(client, msg.RequestID, "the firewall is not available", "NOT_SUPPORTED")
		return
	}
	current, err := s.settings.Firewall()
	if errors.Is(err, settings.ErrNoFirewall) {
		s.sendRequestError(client, msg.RequestID, "the firewall is only available on the CCU", "NOT_SUPPORTED")
		return
	}
	if err != nil {
		s.sendRequestError(client, msg.RequestID, "firewall: "+err.Error(), "CCU_ERROR")
		return
	}
	switch msgType {
	case "getFirewall":
		s.sendJSON(client, firewallResponse{Type: "getFirewall_response", RequestID: msg.RequestID, Firewall: current})
	case "setFirewall":
		next := msg.Firewall
		entry := audit.Entry{User: client.user, Action: "setFirewall", Target: "firewall", Value: next, Previous: current}
		if code, errorMsg := configureError(client); code != "" {
			s.recordAudit(entry, code)
			s.sendRequestError(client, msg.RequestID, errorMsg, code)
			return
		}
		if err := next.Validate(); err != nil {
			s.recordAudit(entry, "INVALID_VALUE")
			s.sendRequestError(client, msg.RequestID, "invalid firewall: "+err.Error(), "INVALID_VALUE")
			return
		}
		// Only the services the WebUI's dialog sets; SNMP keeps its access
		services := []map[string]string{}
		for _, id := range settings.FirewallEditable {
			for _, service := range next.Services {
				if service.ID == id {
					services = append(services, map[string]string{"name": id, "access": service.Access})
				}
			}
		}
		ips := next.IPs
		if ips == nil {
			ips = []string{}
		}
		ports := next.UserPorts
		if ports == nil {
			ports = []string{}
		}
		if _, err := s.backup.AdminCall(client.user, msg.Password, "Firewall.setConfiguration", map[string]interface{}{
			"services": services, "ips": ips, "userports": ports, "mode": next.Mode,
		}); err != nil {
			s.securityFailed(client, msg.RequestID, entry, err)
			return
		}
		s.recordAudit(entry, rega.SetOK)
		s.sendJSON(client, changeResponse{Type: "setFirewall_response", RequestID: msg.RequestID, Success: true})
	}
}
