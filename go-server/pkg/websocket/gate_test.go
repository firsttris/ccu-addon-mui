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
	client := &Client{done: make(chan struct{}), gateOK: true, gateSession: GateSession{User: "anna", Level: auth.LevelAdmin},
		gateRequest: httptest.NewRequest(http.MethodGet, "/addons/mui/ws", nil)}
	go s.watchGate(client, gateRecheck)

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

// When occulited could not tell at connect (restarting, a timeout), the
// login asks again: a valid session logs in, and while the platform still
// cannot tell the app hears SYSTEM_UNAVAILABLE, not "session expired"
func TestGateLoginAsksAgainWhenThePlatformCouldNotTell(t *testing.T) {
	var answer atomic.Pointer[error]
	set := func(err error) { answer.Store(&err) }
	set(errors.New("occulited unreachable"))
	s := NewServer(nil, nil)
	s.SetGate(func(r *http.Request) (GateSession, error) {
		if err := *answer.Load(); err != nil {
			return GateSession{}, err
		}
		return GateSession{User: "anna", Level: auth.LevelAdmin}, nil
	})
	client := &Client{send: make(chan []byte, 1), done: make(chan struct{}), gateRequest: httptest.NewRequest(http.MethodGet, "/addons/mui/ws", nil)}
	defer client.close()
	s.checkGate(client)
	if client.gateOK || client.gateErr == nil {
		t.Fatalf("connect while occulited is down: ok %v, err %v", client.gateOK, client.gateErr)
	}
	auth := func() map[string]interface{} {
		s.handleMessage(client, []byte(`{"type":"auth"}`))
		var m map[string]interface{}
		_ = json.Unmarshal(<-client.send, &m)
		return m
	}
	if m := auth(); m["success"] != false || m["code"] != "SYSTEM_UNAVAILABLE" {
		t.Fatalf("still down: %v", m)
	}
	set(nil)
	if m := auth(); m["success"] != true || m["user"] != "anna" {
		t.Fatalf("occulited back: %v", m)
	}
	// A session the platform says is gone stays SESSION_REQUIRED
	set(ErrNoSession)
	gone := &Client{send: make(chan []byte, 1), gateRequest: httptest.NewRequest(http.MethodGet, "/addons/mui/ws", nil)}
	s.checkGate(gone)
	s.handleMessage(gone, []byte(`{"type":"auth"}`))
	var m map[string]interface{}
	_ = json.Unmarshal(<-gone.send, &m)
	if m["code"] != "SESSION_REQUIRED" {
		t.Fatalf("no session: %v", m)
	}
}

// A session that now has another level (changed in openccu-lite) ends the
// connection too: the app reconnects with the new rights
func TestWatchGateLevelChanged(t *testing.T) {
	defer func(previous time.Duration) { gateRecheck = previous }(gateRecheck)
	gateRecheck = 10 * time.Millisecond
	s := NewServer(nil, nil)
	s.SetGate(func(r *http.Request) (GateSession, error) {
		return GateSession{User: "anna", Level: auth.LevelUser}, nil
	})
	client := &Client{done: make(chan struct{}), gateOK: true, gateSession: GateSession{User: "anna", Level: auth.LevelAdmin},
		gateRequest: httptest.NewRequest(http.MethodGet, "/addons/mui/ws", nil)}
	go s.watchGate(client, gateRecheck)
	select {
	case <-client.done:
	case <-time.After(time.Second):
		t.Fatal("still open after the level changed")
	}
}
