//go:build litevm

// Package litevm tests the installed add-on on a real openccu-lite: a VM
// booted from openccu-lite's release image, with this add-on installed
// through occulited (scripts/lite-vm-test.sh, .github/workflows/lite-vm.yml).
// Unlike the tests against the fake openccu-lite, the requests take the real
// way: lighttpd, occulited's session gate, its APIs and the interface
// processes. The VM has no radio module, so it has no devices; what needs
// them stays a test on real hardware.
//
//	MUI_VM_BASE=http://127.0.0.1:8090 MUI_VM_USER=… MUI_VM_PASSWORD=… \
//	MUI_VM_PHASE=prepare go test -tags litevm -v ./litevm
//
// The phases run in this order, with the script restarting and installing
// the add-on again in between:
//   - prepare: logs in through the gate, reads what the app reads on start,
//     creates the room ciRoom and sets the language
//   - verify: the room and the language are still there (after a restart or
//     an update); with MUI_VM_CLEANUP=1 the room is deleted
//   - logout: a logout in openccu-lite ends the open connection, and the next
//     one gets SESSION_REQUIRED
package litevm

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

const ciRoom = "CI-Raum"

type message = map[string]interface{}

type vm struct {
	base   string
	client *http.Client
}

func env(t *testing.T, name string) string {
	t.Helper()
	value := os.Getenv(name)
	if value == "" {
		t.Skipf("%s not set: no openccu-lite VM to test against", name)
	}
	return value
}

// login opens a session of the system, as its login page does: the cookies
// carry it to the session gate in front of /addons/
func login(t *testing.T) *vm {
	t.Helper()
	base := strings.TrimRight(env(t, "MUI_VM_BASE"), "/")
	user, password := env(t, "MUI_VM_USER"), env(t, "MUI_VM_PASSWORD")
	jar, _ := cookiejar.New(nil)
	v := &vm{base: base, client: &http.Client{Jar: jar, Timeout: 30 * time.Second}}
	body, _ := json.Marshal(map[string]string{"username": user, "password": password})
	resp, err := v.client.Post(base+"/api/auth/v1/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("login: %d", resp.StatusCode)
	}
	return v
}

// dial opens the app's WebSocket through lighttpd and the gate; the add-on
// may still be starting after an install or a restart
func (v *vm) dial(t *testing.T) *websocket.Conn {
	t.Helper()
	u, _ := url.Parse(v.base)
	u.Scheme = strings.Replace(u.Scheme, "http", "ws", 1)
	u.Path = "/addons/mui/ws"
	dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second, Jar: v.client.Jar}
	deadline := time.Now().Add(2 * time.Minute)
	for {
		conn, resp, err := dialer.Dial(u.String(), nil)
		if err == nil {
			return conn
		}
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		if time.Now().After(deadline) {
			t.Fatalf("WebSocket %s: %v (HTTP %d)", u, err, status)
		}
		t.Logf("WebSocket not there yet (HTTP %d): %v", status, err)
		time.Sleep(3 * time.Second)
	}
}

// call sends a request and returns the answer with its requestId
func call(t *testing.T, conn *websocket.Conn, request message) message {
	t.Helper()
	request["requestId"] = fmt.Sprint(time.Now().UnixNano())
	request["deviceId"] = "ci"
	if err := conn.WriteJSON(request); err != nil {
		t.Fatal(err)
	}
	_ = conn.SetReadDeadline(time.Now().Add(30 * time.Second))
	for {
		var answer message
		if err := conn.ReadJSON(&answer); err != nil {
			t.Fatalf("%v: %v", request["type"], err)
		}
		if answer["requestId"] == request["requestId"] || (request["type"] == "auth" && answer["type"] == "auth_response") {
			return answer
		}
	}
}

// ok fails on an error answer
func ok(t *testing.T, answer message) message {
	t.Helper()
	if answer["type"] == "error" || answer["success"] == false {
		t.Fatalf("%v", answer)
	}
	return answer
}

func (v *vm) adminConn(t *testing.T) *websocket.Conn {
	t.Helper()
	conn := v.dial(t)
	t.Cleanup(func() { conn.Close() })
	m := call(t, conn, message{"type": "auth"})
	if m["success"] != true || m["platform"] != "lite" || m["level"] != "admin" || m["elevated"] != true {
		t.Fatalf("auth through the gate: %v", m)
	}
	return conn
}

func roomID(t *testing.T, conn *websocket.Conn) (int64, bool) {
	t.Helper()
	rooms, _ := ok(t, call(t, conn, message{"type": "getRooms"}))["rooms"].([]interface{})
	for _, r := range rooms {
		if room := r.(map[string]interface{}); room["name"] == ciRoom {
			return int64(room["id"].(float64)), true
		}
	}
	return 0, false
}

func TestLiteVM(t *testing.T) {
	switch phase := env(t, "MUI_VM_PHASE"); phase {
	case "prepare":
		prepare(t, login(t))
	case "verify":
		verify(t, login(t))
	case "logout":
		logout(t, login(t))
	default:
		t.Fatalf("unknown phase %q", phase)
	}
}

func prepare(t *testing.T, v *vm) {
	conn := v.adminConn(t)
	// What the app reads on start
	for _, request := range []string{"getRooms", "getTrades", "getFavorites", "getServiceMessages", "getDeviceHealth", "getSystemInfo", "getInbox"} {
		ok(t, call(t, conn, message{"type": request}))
	}
	channels, _ := ok(t, call(t, conn, message{"type": "getChannels", "all": true}))["channels"].([]interface{})
	t.Logf("%d channels (no radio module in the VM)", len(channels))
	keys, _ := ok(t, call(t, conn, message{"type": "getVirtualKeys"}))["keys"].([]interface{})
	t.Logf("%d virtual keys", len(keys))
	// Only a CCU has these
	if m := call(t, conn, message{"type": "getSysvars"}); m["type"] != "error" {
		t.Fatalf("getSysvars on openccu-lite: %v", m)
	}

	// A room in occulited's store, the language in the add-on's data
	if _, found := roomID(t, conn); !found {
		ok(t, call(t, conn, message{"type": "createGroup", "list": "rooms", "name": ciRoom}))
	}
	if _, found := roomID(t, conn); !found {
		t.Fatalf("%s not in the rooms after createGroup", ciRoom)
	}
	ok(t, call(t, conn, message{"type": "setUserLanguage", "language": 2}))
}

func verify(t *testing.T, v *vm) {
	conn := v.adminConn(t)
	id, found := roomID(t, conn)
	if !found {
		t.Fatalf("%s is gone", ciRoom)
	}
	if m := ok(t, call(t, conn, message{"type": "getUserLanguage"})); m["language"] != 2.0 {
		t.Fatalf("language not kept: %v", m)
	}
	if os.Getenv("MUI_VM_CLEANUP") == "1" {
		ok(t, call(t, conn, message{"type": "deleteGroup", "list": "rooms", "id": id}))
	}
}

func logout(t *testing.T, v *vm) {
	conn := v.adminConn(t)
	// A state-changing call on the session cookie needs X-Occulite-Request
	// (occulited docs/system-api.md, /api/auth/v1), as the shell sends it
	request, _ := http.NewRequest(http.MethodPost, v.base+"/api/auth/v1/logout", nil)
	request.Header.Set("X-Occulite-Request", "1")
	resp, err := v.client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode >= 300 {
		t.Fatalf("logout: %d", resp.StatusCode)
	}
	// The server checks the session of open connections every minute
	started := time.Now()
	_ = conn.SetReadDeadline(time.Now().Add(150 * time.Second))
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			t.Logf("connection closed %s after the logout: %v", time.Since(started).Round(time.Second), err)
			break
		}
	}
	if time.Since(started) > 140*time.Second {
		t.Fatal("the connection stayed open after the logout")
	}

	// Without a session the gate either refuses the upgrade or passes no
	// session on; then the server asks for the platform's login
	u, _ := url.Parse(v.base)
	u.Scheme = strings.Replace(u.Scheme, "http", "ws", 1)
	u.Path = "/addons/mui/ws"
	again, resp, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		if resp == nil || resp.StatusCode < 300 {
			t.Fatalf("dial without a session: %v", err)
		}
		t.Logf("gate refused the upgrade without a session: HTTP %d", resp.StatusCode)
		return
	}
	defer again.Close()
	if m := call(t, again, message{"type": "auth"}); m["success"] != false || m["code"] != "SESSION_REQUIRED" {
		t.Fatalf("auth without a session: %v", m)
	}
}
