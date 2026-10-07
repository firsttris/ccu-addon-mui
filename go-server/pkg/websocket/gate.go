package websocket

import (
	"context"
	"errors"
	"net/http"
	"time"

	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/home"
	"ccu-addon-mui-server/pkg/logger"
)

// GateSession is who a platform's login gate let through: on openccu-lite
// occulited's session gate in front of /addons/ (occulite.SessionHeader).
// Level is already this add-on's: admin, user or guest.
type GateSession struct {
	User  string
	Level string
	// Value is the session itself (X-Occulite-Session): the credential
	// for what this user changes through the platform's APIs
	Value string
	// Administrator: the platform's highest level (openccu-lite's
	// administer). Its configure level is this add-on's admin too, but may
	// not delete, replace or update devices nor change heating groups
	// (systemAdminError).
	Administrator bool
}

// ErrNoSession: the request carries no valid session of the platform (none,
// expired, logged out). Any other error of a GateFunc means the platform
// could not tell.
var ErrNoSession = errors.New("no session of the system")

// GateFunc tells from the WebSocket upgrade who is logged in
type GateFunc func(r *http.Request) (GateSession, error)

// How often an open connection's session is checked again: a logout in the
// platform must end it, not only the next connect
var gateRecheck = time.Minute

// SetGate makes the platform's login decide who is logged in, instead of
// this add-on's own (openccu-lite). Its administrators are always elevated:
// the platform asks for the password itself.
func (s *Server) SetGate(gate GateFunc) {
	s.gate = gate
}

// systemAdminError says why a client may not delete, replace or update
// devices or change heating groups on openccu-lite, or "" if it may. The
// system keeps them to administer: they need rpc:admin and system:write,
// which configure lacks (occulited docs/lite-rpc-methods.json,
// docs/system-api.md "Scopes"), and the add-on must not let an account do
// more than the system does.
func (s *Server) systemAdminError(c *Client) (code, message string) {
	if s.gate == nil || c.gateSession.Administrator {
		return "", ""
	}
	return "FORBIDDEN", "only the system's administrators may do this"
}

// gateLogin answers auth from the session the gate let through. Without
// one (it expired) the app's own login would never succeed: SESSION_REQUIRED
// sends it to the platform's login instead.
func (s *Server) gateLogin(client *Client) {
	if !client.gateOK {
		s.sendAuth(client, authResponse{Type: "auth_response", Code: "SESSION_REQUIRED", Error: "no session of the system"})
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

// watchGate checks the session of an open connection again every
// gateRecheck and closes the connection when it ended or now belongs to
// someone else or another level; the app reconnects and gets
// SESSION_REQUIRED. A platform that cannot tell keeps the connection.
func (s *Server) watchGate(client *Client, r *http.Request) {
	request := r.Clone(context.Background())
	ticker := time.NewTicker(gateRecheck)
	defer ticker.Stop()
	for {
		select {
		case <-client.done:
			return
		case <-ticker.C:
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			session, err := s.gate(request.WithContext(ctx))
			cancel()
			switch {
			case errors.Is(err, ErrNoSession):
				logger.Info("🔒 Session of the system ended, closing the connection of " + client.DeviceID())
			case err != nil:
				logger.Debugf("Checking the session of the system: %v", err)
				continue
			case session != client.gateSession:
				logger.Info("🔒 Session of the system changed, closing the connection of " + client.DeviceID())
			default:
				continue
			}
			client.close()
			return
		}
	}
}

// sessionRPC is a device RPC that can make its calls with another
// credential (ccurpc on openccu-lite, through lite-rpc)
type sessionRPC interface {
	WithToken(token string) *ccurpc.Client
}

// rpcFor is the device RPC for what client asks: on openccu-lite with the
// user's session, so that the system checks the user's level for every
// call and its journal names the user (Sebastian in #191); else the
// server's own
func (s *Server) rpcFor(client *Client) DeviceRPC {
	if r, ok := s.rpc.(sessionRPC); ok && client != nil && client.gateSession.Value != "" {
		return r.WithToken(client.gateSession.Value)
	}
	return s.rpc
}

// homeFor is the home model as client acts on it: on openccu-lite with the
// user's session (occulite.Home.ForSession)
func (s *Server) homeFor(client *Client) home.Source {
	if h, ok := s.home.(interface{ ForSession(string) home.Source }); ok && client != nil && client.gateSession.Value != "" {
		return h.ForSession(client.gateSession.Value)
	}
	return s.home
}
