//go:build !lite

package websocket

import (
	"errors"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/settings"
)

// The interface and routing table the network state is read from
var (
	networkInterface = "eth0"
	routeFile        = "/proc/net/route"
)

type tailscaleState struct {
	Available bool `json:"available"`
	Enabled   bool `json:"enabled"`
}

type networkResponse struct {
	Type      string             `json:"type"`
	RequestID string             `json:"requestId,omitempty"`
	Config    settings.NetConfig `json:"config"`
	Current   settings.NetState  `json:"current"`
	Tailscale tailscaleState     `json:"tailscale"`
}

// handleNetwork shows and changes the CCU's network setup, as the WebUI's
// cp_network.cgi (Systemsteuerung → Netzwerkeinstellungen): host name, DHCP
// or fixed addresses, name servers, and OpenCCU's Tailscale VPN; for
// administrators, changes elevated with audit log. The CCU takes the
// addresses on its next start.
func (s *Server) handleNetwork(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string             `json:"requestId"`
		Config    settings.NetConfig `json:"config"`
		Tailscale bool               `json:"tailscale"`
	}
	if !s.decode(client, message, &msg) {
		return
	}
	if client.level != auth.LevelAdmin {
		s.sendRequestError(client, msg.RequestID, "only administrators may see the network settings", "FORBIDDEN")
		return
	}
	if s.settings == nil {
		s.sendRequestError(client, msg.RequestID, "network settings are not available", "NOT_SUPPORTED")
		return
	}
	current, err := s.settings.NetConfig()
	if errors.Is(err, settings.ErrNoNetConfig) {
		s.sendRequestError(client, msg.RequestID, "network settings are only available on the CCU", "NOT_SUPPORTED")
		return
	}
	if err != nil {
		s.sendRequestError(client, msg.RequestID, "network settings: "+err.Error(), "CCU_ERROR")
		return
	}
	tailscale := tailscaleState{Available: settings.TailscaleAvailable(), Enabled: s.settings.Flag(settings.TailscaleEnabled)}
	switch msgType {
	case "getNetwork":
		s.sendJSON(client, networkResponse{
			Type: "getNetwork_response", RequestID: msg.RequestID, Config: current,
			Current: settings.NetStateOf(networkInterface, routeFile), Tailscale: tailscale,
		})
	case "setNetwork":
		next := msg.Config
		s.configure(client, msg.RequestID, audit.Entry{Action: "setNetwork", Target: "network", Value: map[string]any{"config": next, "tailscale": msg.Tailscale}},
			func() (any, string, error) {
				if err := next.Validate(); err != nil {
					return nil, "", errors.New("invalid network settings: " + err.Error())
				}
				if err := s.settings.SetNetConfig(next); err != nil {
					return nil, "", err
				}
				if tailscale.Available && msg.Tailscale != tailscale.Enabled {
					if err := s.settings.SetTailscale(msg.Tailscale); err != nil {
						return current, "", err
					}
				}
				return map[string]any{"config": current, "tailscale": tailscale.Enabled}, rega.SetOK, nil
			})
	}
}
