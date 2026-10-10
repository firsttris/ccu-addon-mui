//go:build !lite

package websocket

import (
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
	var msg lanGatewayRequest
	if !s.decode(client, message, &msg) {
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
	c := gatewayChange{client: client, rpc: s.rpcFor(client), msg: msg, current: current, modules: []ccurpc.RadioInterface{}}
	if s.rpc != nil {
		if list, err := c.rpc.ListBidcosInterfaces(bidcosRF); err == nil {
			c.modules = list
		}
	}
	if msgType == "getLanGateways" {
		response := lanGatewaysResponse{Type: "getLanGateways_response", RequestID: msg.RequestID, Gateways: []lanGatewayState{}, Modules: c.modules}
		for _, g := range current {
			response.Gateways = append(response.Gateways, gatewayState(g, c.modules))
		}
		s.sendJSON(client, response)
		return
	}
	change, ok := gatewayChanges[msgType]
	if !ok {
		return
	}
	entry := change.entry(c)
	entry.User, entry.Action = client.user, msgType
	if !s.mayConfigure(client, msg.RequestID, entry) {
		return
	}
	if err := change.run(s, c); err != nil {
		s.failChange(client, msg.RequestID, entry, err, errorCode{errInvalidGateway, "INVALID_VALUE"})
		return
	}
	s.recordAudit(entry, rega.SetOK)
	s.sendJSON(client, changeResponse{Type: msgType + "_response", RequestID: msg.RequestID, Success: true})
}

type lanGatewayRequest struct {
	RequestID string                `json:"requestId"`
	Gateways  []settings.LanGateway `json:"gateways"`
	Serial    string                `json:"serial"`
	Key       string                `json:"key"`
	Address   string                `json:"address"`
	Module    string                `json:"module"`
	Roaming   bool                  `json:"roaming"`
	Password  string                `json:"password"`
}

// What a change of the gateways starts from: the request, the gateways and
// the radio modules as they are
type gatewayChange struct {
	client  *Client
	rpc     DeviceRPC
	msg     lanGatewayRequest
	current []settings.LanGateway
	modules []ccurpc.RadioInterface
}

// A change refused for its values
var errInvalidGateway = errors.New("invalid")

// A change of the gateways: its audit entry and the change itself
var gatewayChanges = map[string]struct {
	entry func(c gatewayChange) audit.Entry
	run   func(s *Server, c gatewayChange) error
}{
	"setLanGateways": {
		entry: func(c gatewayChange) audit.Entry {
			// The keys are never written to the audit log
			serials := func(list []settings.LanGateway) []string {
				out := []string{}
				for _, g := range list {
					out = append(out, g.Class+" "+g.Type+" "+g.Serial)
				}
				return out
			}
			return audit.Entry{Target: "lanGateways", Value: serials(c.msg.Gateways), Previous: serials(c.current)}
		},
		run: setLanGateways,
	},
	"changeLanGatewayKey": {
		entry: func(c gatewayChange) audit.Entry { return audit.Entry{Target: c.msg.Serial} },
		run:   changeLanGatewayKey,
	},
	"setBidcosInterface": {
		entry: func(c gatewayChange) audit.Entry {
			return audit.Entry{Target: c.msg.Address, Value: map[string]any{"module": c.msg.Module, "roaming": c.msg.Roaming}}
		},
		run: setBidcosInterface,
	},
}

func setLanGateways(s *Server, c gatewayChange) error {
	if err := settings.ValidateGateways(c.msg.Gateways); err != nil {
		return fmt.Errorf("%w: %v", errInvalidGateway, err)
	}
	rf, wired := []map[string]string{}, []map[string]string{}
	for _, g := range c.msg.Gateways {
		// As BidcosRfPage.onApply sends them
		item := map[string]string{"type": g.Type, "userName": g.Name, "serialNumber": g.Serial, "encryptionKey": g.Key, "ipAddress": g.IP}
		if g.Class == "Wired" {
			wired = append(wired, item)
		} else {
			rf = append(rf, item)
		}
	}
	password := c.msg.Password
	for _, call := range []struct {
		method string
		items  []map[string]string
	}{{"BidCoS_RF.setConfigurationRF", rf}, {"BidCoS_Wired.setConfigurationWired", wired}} {
		result, err := s.backup.AdminCall(c.client.user, password, call.method, map[string]any{"interfaces": call.items})
		if err == nil && result == false {
			err = errors.New("the CCU did not write the configuration")
		}
		if err != nil {
			return err
		}
		// The password opened the session; the second call uses it
		password = ""
	}
	return nil
}

func changeLanGatewayKey(s *Server, c gatewayChange) error {
	var gateway *settings.LanGateway
	for i := range c.current {
		if c.current[i].Serial == c.msg.Serial {
			gateway = &c.current[i]
		}
	}
	if gateway == nil || (gateway.Type != "HMLGW2" && gateway.Type != "HMWLGW") {
		return fmt.Errorf("%w: no gateway with a changeable key: %s", errInvalidGateway, c.msg.Serial)
	}
	if !settings.ValidKey(c.msg.Key) {
		return fmt.Errorf("%w: the key must not be empty nor contain %s", errInvalidGateway, settings.KeyForbidden)
	}
	result, err := s.backup.AdminCall(c.client.user, c.msg.Password, "BidCoS.changeLanGatewayKey", map[string]any{
		"lgwclass": gateway.Class, "lgwserial": gateway.Serial, "lgwip": gateway.IP, "newkey": c.msg.Key, "curkey": gateway.Key,
	})
	if err == nil && result == false {
		err = errors.New("the CCU did not take the key")
	}
	return err
}

func setBidcosInterface(s *Server, c gatewayChange) error {
	known := false
	for _, m := range c.modules {
		known = known || m.Address == c.msg.Module
	}
	if !known || s.rpc == nil {
		return fmt.Errorf("%w: unknown radio module %q", errInvalidGateway, c.msg.Module)
	}
	return c.rpc.SetBidcosInterface(bidcosRF, c.msg.Address, c.msg.Module, c.msg.Roaming)
}
