package occulite

import (
	"context"
	"errors"
	"net/http"
)

// SessionHeader is the header occulited's gate adds to every request under
// /addons/, the WebSocket upgrade included, with the session it accepted.
// lighttpd removes any copy a client sent.
const SessionHeader = "X-Occulite-Session"

// Session is the answer of GET /api/auth/v1/state
type Session struct {
	Authenticated bool   `json:"authenticated"`
	SID           string `json:"sid"`
	User          string `json:"user"`
	// read, operate, configure or administer
	Level string `json:"level"`
}

// Levels of openccu-lite
const (
	LevelRead       = "read"
	LevelOperate    = "operate"
	LevelConfigure  = "configure"
	LevelAdminister = "administer"
)

// CheckSession asks occulited who the gate's session value belongs to. A
// session counts only when it is authenticated and its sid is the value
// itself; an API token at the gate (no sid) does not log a user in
// (ccu-addon-howto docs/11-openccu-lite.md, "Sessions"). ErrNoSession
// when it is none; another error when occulited could not tell.
func (c *Client) CheckSession(ctx context.Context, value string) (Session, error) {
	if value == "" {
		return Session{}, ErrNoSession
	}
	var session Session
	if err := c.do(ctx, http.MethodGet, "/api/auth/v1/state", value, nil, &session); err != nil {
		var apiErr *Error
		if errors.As(err, &apiErr) && (apiErr.Status == http.StatusUnauthorized || apiErr.Status == http.StatusForbidden) {
			return Session{}, ErrNoSession
		}
		return Session{}, err
	}
	if !session.Authenticated || session.SID == "" || session.SID != value || session.User == "" {
		return Session{}, ErrNoSession
	}
	return session, nil
}

// ErrNoSession: the value is no valid session
var ErrNoSession = errors.New("no session")
