package websocket

import (
	"encoding/json"
	"net/http"
	"testing"

	"ccu-addon-mui-server/pkg/auth"
)

// With a gate (openccu-lite) the platform's session logs in: no token, no
// login form, administrators need no password again
func TestGateLogin(t *testing.T) {
	s := NewServer(nil, nil)
	s.SetGate(func(*http.Request) (GateSession, bool) { return GateSession{}, false })
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
	if m := answer(nobody, `{"type":"auth"}`); m["success"] != false || m["code"] != "LOGIN_REQUIRED" {
		t.Fatalf("no session: %v", m)
	}
	if m := answer(nobody, `{"type":"login","username":"Admin","password":"x"}`); m["success"] != false {
		t.Fatalf("login without session: %v", m)
	}
	if m := answer(nobody, `{"type":"getRooms","requestId":"2","deviceId":"d"}`); m["code"] != "AUTH_REQUIRED" {
		t.Fatalf("request without session: %v", m)
	}
}
