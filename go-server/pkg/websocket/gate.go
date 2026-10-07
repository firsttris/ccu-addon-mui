package websocket

import (
	"net/http"

	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/logger"
)

// GateSession is who a platform's login gate let through: on openccu-lite
// occulited's session gate in front of /addons/ (occulite.SessionHeader).
// Level is already this add-on's: admin, user or guest.
type GateSession struct {
	User  string
	Level string
}

// GateFunc tells from the WebSocket upgrade who is logged in; ok is false
// without a valid session
type GateFunc func(r *http.Request) (session GateSession, ok bool)

// SetGate makes the platform's login decide who is logged in, instead of
// this add-on's own (openccu-lite). Its administrators are always elevated:
// the platform asks for the password itself.
func (s *Server) SetGate(gate GateFunc) {
	s.gate = gate
}

// gateLogin answers auth from the session the gate let through
func (s *Server) gateLogin(client *Client) {
	if !client.gateOK {
		s.sendAuth(client, authResponse{Type: "auth_response", AuthRequired: true, Code: "LOGIN_REQUIRED", Error: "no session of the system"})
		return
	}
	client.setSession(client.gateSession.User, client.gateSession.Level)
	if client.gateSession.Level == auth.LevelAdmin {
		client.elevatedUntil = alwaysElevated
	}
	logger.Debugf("Session of the system: %q (%s)", client.gateSession.User, client.gateSession.Level)
	// No login of its own: authRequired false, so the app offers neither
	// logout nor the list of logged-in devices
	s.sendAuth(client, authResponse{
		Type: "auth_response", Success: true, User: client.user, Level: client.level, Elevated: client.elevated(),
	})
}
