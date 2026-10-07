package websocket

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"ccu-addon-mui-server/pkg/auth"
)

// With a gate (openccu-lite) the platform's session logs in: no token, no
// login form, administrators need no password again
func TestGateLogin(t *testing.T) {
	s := NewServer(nil, nil)
	s.SetGate(func(*http.Request) (GateSession, error) { return GateSession{}, ErrNoSession })
	answer := func(client *Client, request string) map[string]interface{} {
		s.handleMessage(client, []byte(request))
		var m map[string]interface{}
		_ = json.Unmarshal(<-client.send, &m)
		return m
	}

	admin := &Client{send: make(chan []byte, 1), gateOK: true, gateSession: GateSession{User: "anna", Level: auth.LevelAdmin}}
	m := answer(admin, `{"type":"auth"}`)
	if m["success"] != true || m["user"] != "anna" || m["level"] != "admin" || m["elevated"] != true || m["authRequired"] != false {
		t.Fatalf("admin: %v", m)
	}
	if m := answer(admin, `{"type":"getUserLanguage","requestId":"1"}`); m["type"] == "error" && m["code"] == "AUTH_REQUIRED" {
		t.Fatalf("logged in admin refused: %v", m)
	}

	guest := &Client{send: make(chan []byte, 1), gateOK: true, gateSession: GateSession{User: "gast", Level: auth.LevelGuest}}
	if m := answer(guest, `{"type":"auth"}`); m["level"] != "guest" || m["elevated"] != false {
		t.Fatalf("guest: %v", m)
	}

	// Without a session nothing goes, the login form does not help either
	nobody := &Client{send: make(chan []byte, 1)}
	if m := answer(nobody, `{"type":"auth"}`); m["success"] != false || m["code"] != "SESSION_REQUIRED" {
		t.Fatalf("no session: %v", m)
	}
	if m := answer(nobody, `{"type":"login","username":"Admin","password":"x"}`); m["success"] != false {
		t.Fatalf("login without session: %v", m)
	}
	if m := answer(nobody, `{"type":"getRooms","requestId":"2","deviceId":"d"}`); m["code"] != "AUTH_REQUIRED" {
		t.Fatalf("request without session: %v", m)
	}
}

// An open connection ends when its session does (a logout in the
// platform), not when the platform cannot tell
func TestWatchGate(t *testing.T) {
	defer func(previous time.Duration) { gateRecheck = previous }(gateRecheck)
	gateRecheck = 10 * time.Millisecond
	var answer atomic.Value
	answer.Store(error(errors.New("occulited unreachable")))
	s := NewServer(nil, nil)
	s.SetGate(func(r *http.Request) (GateSession, error) {
		if err := answer.Load().(error); err != nil {
			return GateSession{}, err
		}
		return GateSession{User: "anna", Level: auth.LevelAdmin}, nil
	})
	client := &Client{done: make(chan struct{}), gateOK: true, gateSession: GateSession{User: "anna", Level: auth.LevelAdmin}}
	go s.watchGate(client, httptest.NewRequest(http.MethodGet, "/addons/mui/ws", nil))

	select {
	case <-client.done:
		t.Fatal("closed while the platform could not tell")
	case <-time.After(100 * time.Millisecond):
	}
	answer.Store(error(ErrNoSession))
	select {
	case <-client.done:
	case <-time.After(time.Second):
		t.Fatal("still open after the session ended")
	}
}

// On openccu-lite configure is this add-on's admin, but deleting, replacing
// and updating devices and changing heating groups stay administer's, as in
// the system itself
func TestSystemAdminOnly(t *testing.T) {
	s := NewServer(nil, nil)
	configure := &Client{level: auth.LevelAdmin, elevatedUntil: alwaysElevated, gateOK: true, gateSession: GateSession{User: "anna", Level: auth.LevelAdmin}}
	administer := &Client{level: auth.LevelAdmin, elevatedUntil: alwaysElevated, gateOK: true, gateSession: GateSession{User: "otto", Level: auth.LevelAdmin, Administrator: true}}

	// A CCU has no such level
	if code, _ := s.groupChangeError(configure); code != "" {
		t.Fatalf("without a gate: %s", code)
	}
	s.SetGate(func(*http.Request) (GateSession, error) { return GateSession{}, ErrNoSession })
	if code, _ := s.groupChangeError(configure); code != "FORBIDDEN" {
		t.Fatalf("configure: %q", code)
	}
	if code, _ := s.systemAdminError(configure.snapshot()); code != "FORBIDDEN" {
		t.Fatalf("configure, snapshot: %q", code)
	}
	if code, _ := s.groupChangeError(administer); code != "" {
		t.Fatalf("administer: %q", code)
	}
	// The firmware update runs on a snapshot of the client
	if code, _ := s.systemAdminError(administer.snapshot()); code != "" {
		t.Fatalf("administer, snapshot: %q", code)
	}
}
