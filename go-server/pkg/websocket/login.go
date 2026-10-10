package websocket

import (
	"encoding/json"
	"fmt"
	"time"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
)

type authResponse struct {
	Type         string `json:"type"`
	Success      bool   `json:"success"`
	AuthRequired bool   `json:"authRequired"`
	User         string `json:"user,omitempty"`
	// Level is the CCU user level ("admin", "user", "guest"), empty if
	// unknown.
	Level string `json:"level,omitempty"`
	// AdminToken (administrators, after entering the password) allows
	// changing settings for a few hours; Elevated says whether it is valid.
	AdminToken string `json:"adminToken,omitempty"`
	Elevated   bool   `json:"elevated"`
	// ElevatedUntil is when the admin rights end (RFC 3339)
	ElevatedUntil string `json:"elevatedUntil,omitempty"`
	Token         string `json:"token,omitempty"`
	Error         string `json:"error,omitempty"`
	Code          string `json:"code,omitempty"`
	// What the add-on runs on and what it can do there (platform.go)
	Platform     string        `json:"platform,omitempty"`
	Capabilities *Capabilities `json:"capabilities,omitempty"`
}

// handleAuth checks a stored token. Every client sends this first after
// connecting; a valid token is renewed, so a device in regular use never
// has to log in again.
func (s *Server) handleAuth(client *Client, message []byte) {
	var msg struct {
		Token      string `json:"token"`
		AdminToken string `json:"adminToken"`
		// Logged out on purpose: show the login, not the automatic one
		NoAutoLogin bool `json:"noAutoLogin"`
	}
	_ = json.Unmarshal(message, &msg)

	if s.gate != nil {
		s.gateLogin(client)
		return
	}

	if s.auth == nil {
		// Without authentication everyone can do everything
		client.setSession("", auth.LevelAdmin)
		client.elevatedUntil = alwaysElevated
		s.sendAuth(client, authResponse{Type: "auth_response", Success: true, Level: auth.LevelAdmin, Elevated: true})
		return
	}

	session, token, err := s.auth.Refresh(msg.Token, client.device)
	if err != nil && !msg.NoAutoLogin {
		// The user the CCU logs in automatically, if one is set (not an
		// administrator, see AutoLogin)
		if user := s.autoLoginUser(); user != "" {
			session, token, err = s.auth.AutoLogin(user, client.device)
			if err == nil {
				logger.Info(fmt.Sprintf("🔓 User %q logged in automatically", user))
			}
		}
	}
	if err != nil {
		client.authenticated = false
		client.watchSysvars(false)
		client.unwatchMessages()
		s.sendAuth(client, authResponse{Type: "auth_response", AuthRequired: true, Code: "LOGIN_REQUIRED"})
		return
	}

	client.setSession(session.User, session.Level)
	client.setSessionID(session.ID)
	if msg.AdminToken != "" {
		if expiry, ok := s.auth.VerifyAdmin(msg.AdminToken, session.User); ok {
			client.elevatedUntil = expiry
		}
	}
	s.sendAuth(client, authResponse{
		Type: "auth_response", Success: true, AuthRequired: true, User: session.User, Level: session.Level,
		Token: token, Elevated: client.elevated(), ElevatedUntil: client.elevatedUntilText(),
	})
}

// handleLogin verifies CCU credentials and returns a token for the client
// to store.
func (s *Server) handleLogin(client *Client, message []byte) {
	var msg struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, "", "invalid login message", "INVALID_REQUEST")
		return
	}

	// The platform logs in (openccu-lite's login page)
	if s.gate != nil {
		s.gateLogin(client)
		return
	}

	if s.auth == nil {
		client.setSession("", auth.LevelAdmin)
		client.elevatedUntil = alwaysElevated
		s.sendAuth(client, authResponse{Type: "auth_response", Success: true, Level: auth.LevelAdmin, Elevated: true})
		return
	}

	session, token, err := s.auth.Login(msg.Username, msg.Password, client.device, client.source)
	if err != nil {
		code := "CCU_UNREACHABLE"
		switch err {
		case auth.ErrInvalidCredentials:
			code = "INVALID_CREDENTIALS"
		case auth.ErrTooManyAttempts:
			code = "TOO_MANY_ATTEMPTS"
		case auth.ErrCCUNotReady:
			code = "CCU_NOT_READY"
		}
		logger.Info(fmt.Sprintf("🔒 Login failed for user %q: %v", msg.Username, err))
		s.sendAuth(client, authResponse{Type: "auth_response", AuthRequired: true, Error: err.Error(), Code: code})
		return
	}

	logger.Info(fmt.Sprintf("🔓 User %q logged in", msg.Username))
	client.setSession(session.User, session.Level)
	client.setSessionID(session.ID)
	// The password was just entered: administrators may set up right away
	adminToken, err := s.auth.IssueAdminToken(session)
	if err == nil {
		client.elevatedUntil = s.auth.AdminTokenExpiry()
	}
	s.sendAuth(client, authResponse{
		Type: "auth_response", Success: true, AuthRequired: true, User: session.User, Level: session.Level,
		Token: token, AdminToken: adminToken, Elevated: client.elevated(), ElevatedUntil: client.elevatedUntilText(),
	})
}

type elevateResponse struct {
	Type       string `json:"type"`
	RequestID  string `json:"requestId,omitempty"`
	Success    bool   `json:"success"`
	AdminToken string `json:"adminToken,omitempty"`
	// ElevatedUntil is when the admin rights end (RFC 3339)
	ElevatedUntil string `json:"elevatedUntil,omitempty"`
}

// handleEndElevation gives up the admin rights of this device before they
// expire: its admin token stops working, it stays logged in. Other
// connections of the device reconnect and so drop their admin rights too.
func (s *Server) handleEndElevation(client *Client, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
	}
	_ = json.Unmarshal(message, &msg)
	if s.auth == nil {
		s.sendRequestError(client, msg.RequestID, "authentication is disabled", "NOT_AVAILABLE")
		return
	}
	client.elevatedUntil = time.Time{}
	if id := client.SessionID(); id != "" {
		s.auth.EndElevation(id)
		s.disconnectSession(id, client)
	}
	// The WebUI session kept for heating groups, security and the like
	s.endWebUISession(client.user)
	s.recordAudit(audit.Entry{User: client.user, Action: "endElevation"}, rega.SetOK)
	logger.Info(fmt.Sprintf("🔒 User %q gave up the admin rights", client.user))
	s.sendJSON(client, elevateResponse{Type: "endElevation_response", RequestID: msg.RequestID, Success: true})
}

// handleElevate checks the password of the logged-in user again and
// returns an admin token for changing settings.
func (s *Server) handleElevate(client *Client, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		Password  string `json:"password"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if s.gate != nil {
		// The platform's administrators are elevated already (gate.go),
		// nobody else is
		if client.gateSession.Level != auth.LevelAdmin {
			s.sendRequestError(client, msg.RequestID, "only administrators may change settings", "FORBIDDEN")
			return
		}
		client.elevatedUntil = alwaysElevated
		s.sendJSON(client, elevateResponse{Type: "elevate_response", RequestID: msg.RequestID, Success: true})
		return
	}
	if s.auth == nil {
		client.elevatedUntil = alwaysElevated
		s.sendJSON(client, elevateResponse{Type: "elevate_response", RequestID: msg.RequestID, Success: true})
		return
	}

	adminToken, err := s.auth.Elevate(client.user, msg.Password, client.SessionID(), client.source)
	if err != nil {
		code := "CCU_UNREACHABLE"
		switch err {
		case auth.ErrInvalidCredentials:
			code = "INVALID_CREDENTIALS"
		case auth.ErrTooManyAttempts:
			code = "TOO_MANY_ATTEMPTS"
		case auth.ErrCCUNotReady:
			code = "CCU_NOT_READY"
		case auth.ErrNotAdmin:
			code = "FORBIDDEN"
		}
		logger.Info(fmt.Sprintf("🔒 Elevation failed for user %q: %v", client.user, err))
		s.sendRequestError(client, msg.RequestID, err.Error(), code)
		return
	}
	client.elevatedUntil = s.auth.AdminTokenExpiry()
	s.sendJSON(client, elevateResponse{Type: "elevate_response", RequestID: msg.RequestID, Success: true, AdminToken: adminToken, ElevatedUntil: client.elevatedUntilText()})
}
