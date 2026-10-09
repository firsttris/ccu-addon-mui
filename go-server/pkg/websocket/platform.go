package websocket

// Platform is what the add-on runs on: "ccu" (CCU3, OpenCCU) or "lite"
// (openccu-lite, without ReGa and the WebUI)
const (
	PlatformCCU  = "ccu"
	PlatformLite = "lite"
)

// Capabilities says which parts of the app the platform has. The app
// hides the others (src/hooks/capabilities.ts).
type Capabilities struct {
	// ReGa programs and scripts, system variables, alarm variables and
	// the system protocol (ReGa history)
	Programs bool `json:"programs"`
	Sysvars  bool `json:"sysvars"`
	Alarms   bool `json:"alarms"`
	History  bool `json:"history"`
	// The CCU's system settings the add-on replaces: time, network,
	// firewall, security, certificate, logging, backup, CCU firmware,
	// add-ons, LAN gateways, restart. On openccu-lite occulited has them.
	System bool `json:"system"`
	// The CCU's users, kept in the ReGa
	Users bool `json:"users"`
	// Updating this add-on from the app; on openccu-lite its catalogue does
	SelfUpdate bool `json:"selfUpdate"`
	// The ReGa's channel options (visible, operable, logged) and the
	// communication test
	ChannelOptions bool `json:"channelOptions"`
	ComTest        bool `json:"comTest"`
}

// CCUCapabilities: a CCU has everything
var CCUCapabilities = Capabilities{
	Programs: true, Sysvars: true, Alarms: true, History: true, System: true, Users: true,
	SelfUpdate: true, ChannelOptions: true, ComTest: true,
}

// SetPlatform sets the platform and what it can do (CCU by default)
func (s *Server) SetPlatform(platform string, capabilities Capabilities) {
	s.platform = platform
	s.capabilities = capabilities
}

// sendAuth sends an auth_response, with the platform when it succeeded
func (s *Server) sendAuth(client *Client, response authResponse) {
	if response.Success {
		response.Platform = s.platform
		capabilities := s.capabilities
		response.Capabilities = &capabilities
	}
	s.sendJSON(client, response)
}
