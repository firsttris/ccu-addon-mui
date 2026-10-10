//go:build !lite

package websocket

import (
	"encoding/json"
	"errors"
	"fmt"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/settings"
)

const bidcosRF = "BidCos-RF"

type lanGatewayState struct {
	settings.LanGateway
	// connected, disconnected, wrongKey or inactive (not taken yet: the
	// CCU uses the gateways after its next start)
	State string `json:"state"`
	// The interface's default radio module
	Default bool `json:"default,omitempty"`
}

type lanGatewaysResponse struct {
	Type      string            `json:"type"`
	RequestID string            `json:"requestId,omitempty"`
	Gateways  []lanGatewayState `json:"gateways"`
	// The radio modules of BidCos-RF (built-in and gateways), for the
	// assignment of the devices
	Modules []ccurpc.RadioInterface `json:"modules"`
}

// gatewayState is the state BidcosRfPage.onUpdate shows: from the
// connstat file for an HMLGW2 or HMWLGW, else from listBidcosInterfaces
func gatewayState(g settings.LanGateway, modules []ccurpc.RadioInterface) lanGatewayState {
	state := lanGatewayState{LanGateway: g, State: "inactive"}
	for _, m := range modules {
		if m.Address == g.Serial {
			state.Default = m.Default
			if g.Type != "HMLGW2" && g.Type != "HMWLGW" {
				state.State = "disconnected"
				if m.Connected {
					state.State = "connected"
				}
			}
		}
	}
	if g.Type == "HMLGW2" || g.Type == "HMWLGW" {
		switch settings.GatewayConnState(g.Serial) {
		case "NO_ERROR":
			state.State = "connected"
		case "WRONG_KEY":
			state.State = "wrongKey"
		case "":
		default:
			state.State = "disconnected"
		}
	}
	return state
}

// handleLanGateways shows and changes the LAN gateways of the BidCos
// interfaces and the assignment of the BidCos-RF devices to the radio
// modules, as the WebUI's BidcosRfPage (Systemsteuerung → LAN-Gateway):
// the gateways are written through BidCoS_RF.setConfigurationRF and
// BidCoS_Wired.setConfigurationWired (taken on the next start), a new key
// through BidCoS.changeLanGatewayKey, with the kept WebUI session; the
// assignment through setBidcosInterface. For administrators, elevated,
// with audit log.
func (s *Server) handleLanGateways(client *Client, msgType string, message []byte) {
	rpc := s.rpcFor(client)
	var msg struct {
		RequestID string                `json:"requestId"`
		Gateways  []settings.LanGateway `json:"gateways"`
		Serial    string                `json:"serial"`
		Key       string                `json:"key"`
		Address   string                `json:"address"`
		Module    string                `json:"module"`
		Roaming   bool                  `json:"roaming"`
		Password  string                `json:"password"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if client.level != auth.LevelAdmin {
		s.sendRequestError(client, msg.RequestID, "only administrators may see the LAN gateways", "FORBIDDEN")
		return
	}
	if s.settings == nil || s.backup == nil {
		s.sendRequestError(client, msg.RequestID, "the LAN gateways are not available", "NOT_SUPPORTED")
		return
	}
	current, err := s.settings.LanGateways()
	if err != nil {
		s.sendRequestError(client, msg.RequestID, "LAN gateways: "+err.Error(), "CCU_ERROR")
		return
	}
	modules := []ccurpc.RadioInterface{}
	if s.rpc != nil {
		if list, err := rpc.ListBidcosInterfaces(bidcosRF); err == nil {
			modules = list
		}
	}
	if msgType == "getLanGateways" {
		response := lanGatewaysResponse{Type: "getLanGateways_response", RequestID: msg.RequestID, Gateways: []lanGatewayState{}, Modules: modules}
		for _, g := range current {
			response.Gateways = append(response.Gateways, gatewayState(g, modules))
		}
		s.sendJSON(client, response)
		return
	}

	var entry audit.Entry
	switch msgType {
	case "setLanGateways":
		// The keys are never written to the audit log
		serials := func(list []settings.LanGateway) []string {
			out := []string{}
			for _, g := range list {
				out = append(out, g.Class+" "+g.Type+" "+g.Serial)
			}
			return out
		}
		entry = audit.Entry{User: client.user, Action: "setLanGateways", Target: "lanGateways", Value: serials(msg.Gateways), Previous: serials(current)}
	case "changeLanGatewayKey":
		entry = audit.Entry{User: client.user, Action: "changeLanGatewayKey", Target: msg.Serial}
	case "setBidcosInterface":
		entry = audit.Entry{User: client.user, Action: "setBidcosInterface", Target: msg.Address, Value: map[string]any{"module": msg.Module, "roaming": msg.Roaming}}
	}
	if code, errorMsg := configureError(client); code != "" {
		s.recordAudit(entry, code)
		s.sendRequestError(client, msg.RequestID, errorMsg, code)
		return
	}
	invalid := func(text string) {
		s.recordAudit(entry, "INVALID_VALUE")
		s.sendRequestError(client, msg.RequestID, text, "INVALID_VALUE")
	}

	switch msgType {
	case "setLanGateways":
		if err := settings.ValidateGateways(msg.Gateways); err != nil {
			invalid(err.Error())
			return
		}
		rf, wired := []map[string]string{}, []map[string]string{}
		for _, g := range msg.Gateways {
			// As BidcosRfPage.onApply sends them
			item := map[string]string{"type": g.Type, "userName": g.Name, "serialNumber": g.Serial, "encryptionKey": g.Key, "ipAddress": g.IP}
			if g.Class == "Wired" {
				wired = append(wired, item)
			} else {
				rf = append(rf, item)
			}
		}
		for _, call := range []struct {
			method string
			items  []map[string]string
		}{{"BidCoS_RF.setConfigurationRF", rf}, {"BidCoS_Wired.setConfigurationWired", wired}} {
			result, err := s.backup.AdminCall(client.user, msg.Password, call.method, map[string]any{"interfaces": call.items})
			if err == nil && result == false {
				err = errors.New("the CCU did not write the configuration")
			}
			if err != nil {
				s.failChange(client, msg.RequestID, entry, err)
				return
			}
			// The password opened the session; the second call uses it
			msg.Password = ""
		}
	case "changeLanGatewayKey":
		var gateway *settings.LanGateway
		for i := range current {
			if current[i].Serial == msg.Serial {
				gateway = &current[i]
			}
		}
		if gateway == nil || (gateway.Type != "HMLGW2" && gateway.Type != "HMWLGW") {
			invalid("no gateway with a changeable key: " + msg.Serial)
			return
		}
		if !settings.ValidKey(msg.Key) {
			invalid("the key must not be empty nor contain " + settings.KeyForbidden)
			return
		}
		result, err := s.backup.AdminCall(client.user, msg.Password, "BidCoS.changeLanGatewayKey", map[string]any{
			"lgwclass": gateway.Class, "lgwserial": gateway.Serial, "lgwip": gateway.IP, "newkey": msg.Key, "curkey": gateway.Key,
		})
		if err == nil && result == false {
			err = errors.New("the CCU did not take the key")
		}
		if err != nil {
			s.failChange(client, msg.RequestID, entry, err)
			return
		}
	case "setBidcosInterface":
		known := false
		for _, m := range modules {
			known = known || m.Address == msg.Module
		}
		if !known || s.rpc == nil {
			invalid(fmt.Sprintf("unknown radio module %q", msg.Module))
			return
		}
		if err := rpc.SetBidcosInterface(bidcosRF, msg.Address, msg.Module, msg.Roaming); err != nil {
			s.failChange(client, msg.RequestID, entry, err)
			return
		}
	}
	s.recordAudit(entry, rega.SetOK)
	s.sendJSON(client, changeResponse{Type: msgType + "_response", RequestID: msg.RequestID, Success: true})
}
