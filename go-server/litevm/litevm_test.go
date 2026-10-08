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
// The phases run in this order, with the script restarting, updating,
// backing up, uninstalling and installing the add-on in between:
//   - prepare: logs in through the gate, reads what the app reads on start,
//     creates the room ciRoom (with umlauts), gives it a layout and sets the
//     language
//   - verify: the room, its layout and the language are still there (after a
//     restart of the add-on, an update and a reboot of the system)
//   - levels: accounts at configure and operate, each through the gate: what
//     MUI lets them do and that the changes reach occulited with their own
//     session; a heating group (occulited's system API) and lite-rpc
//     (VirtualDevices, hmipserver runs without a radio module) with the
//     user's session
//   - fresh: after an uninstall and a new install the add-on's own data is
//     gone (layout, language), the room in occulited's store is not; the
//     room is deleted
//   - logout: a logout in openccu-lite ends the open connection, and the next
//     one gets SESSION_REQUIRED
package litevm

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// Umlauts on the way through occulited's metadata API and back
const ciRoom = "CI-Raum Küche Öfen Maß"

// A layout as the app saves it (src/views/grid/tileLayout.ts), without tiles
const ciLayout = `{"v":3,"order":[],"sections":{}}`

type message = map[string]interface{}

type vm struct {
	base   string
	client *http.Client
	// sid is the session's id from the login, for the APIs that take a
	// browser's session only in the Authorization header (lite-rpc)
	sid string
}

func env(t *testing.T, name string) string {
	t.Helper()
	value := os.Getenv(name)
	if value == "" {
		t.Skipf("%s not set: no openccu-lite VM to test against", name)
	}
	return value
}

// login opens a session of the system's first administrator
func login(t *testing.T) *vm {
	t.Helper()
	return loginAs(t, env(t, "MUI_VM_USER"), env(t, "MUI_VM_PASSWORD"))
}

// loginAs opens a session of the system, as its login page does: the
// cookies carry it to the session gate in front of /addons/
func loginAs(t *testing.T, user, password string) *vm {
	t.Helper()
	base := strings.TrimRight(env(t, "MUI_VM_BASE"), "/")
	jar, _ := cookiejar.New(nil)
	v := &vm{base: base, client: &http.Client{Jar: jar, Timeout: 30 * time.Second}}
	body, _ := json.Marshal(map[string]string{"username": user, "password": password})
	resp, err := v.client.Post(base+"/api/auth/v1/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var session struct {
		SID string `json:"sid"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&session); resp.StatusCode != http.StatusOK || err != nil {
		t.Fatalf("login: %d %v", resp.StatusCode, err)
	}
	v.sid = session.SID
	return v
}

// api calls occulited directly with the session as a bearer: lite-rpc takes
// a browser's session only that way, not with the cookie alone (occulited
// answers 403 forbidden)
func (v *vm) api(t *testing.T, method, path string, body interface{}) (int, []byte) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		data, _ := json.Marshal(body)
		reader = bytes.NewReader(data)
	}
	request, _ := http.NewRequest(method, v.base+path, reader)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+v.sid)
	resp, err := v.client.Do(request)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, data
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
	return v.conn(t, "admin")
}

// conn opens the app's connection and checks the level MUI gives the
// session: configure and administer are admin, operate is user
func (v *vm) conn(t *testing.T, level string) *websocket.Conn {
	t.Helper()
	conn := v.dial(t)
	t.Cleanup(func() { conn.Close() })
	m := call(t, conn, message{"type": "auth"})
	if m["success"] != true || m["platform"] != "lite" || m["level"] != level || (level == "admin" && m["elevated"] != true) {
		t.Fatalf("auth through the gate: %v", m)
	}
	return conn
}

// refused fails unless MUI answered FORBIDDEN
func refused(t *testing.T, answer message) {
	t.Helper()
	if answer["type"] != "error" || answer["code"] != "FORBIDDEN" {
		t.Fatalf("want FORBIDDEN, got %v", answer)
	}
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
	case "levels":
		levels(t, login(t))
	case "fresh":
		fresh(t, login(t))
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
	id, found := roomID(t, conn)
	if !found {
		t.Fatalf("%q not in the rooms after createGroup (umlauts lost?)", ciRoom)
	}
	ok(t, call(t, conn, message{"type": "setLayout", "id": id, "layout": ciLayout}))
	ok(t, call(t, conn, message{"type": "setUserLanguage", "language": 2}))
}

func verify(t *testing.T, v *vm) {
	conn := v.adminConn(t)
	id, found := roomID(t, conn)
	if !found {
		t.Fatalf("%s is gone", ciRoom)
	}
	if m := ok(t, call(t, conn, message{"type": "getLayout", "id": id})); m["layout"] != ciLayout {
		t.Fatalf("layout not kept: %v", m)
	}
	if m := ok(t, call(t, conn, message{"type": "getUserLanguage"})); m["language"] != 2.0 {
		t.Fatalf("language not kept: %v", m)
	}
}

const ciGroup = "CI-Heizgruppe Küche"

// levels: what each level of openccu-lite may do through MUI. MUI maps
// configure to its admin but keeps deleting devices and heating groups to
// administer (rpc:admin, system:write); what it lets through goes to
// occulited with the user's own session, so the system checks it too
func levels(t *testing.T, admin *vm) {
	accounts := map[string]*vm{}
	for _, level := range []string{"configure", "operate"} {
		name, password := "ci-"+level, fmt.Sprintf("ci-%d-%s", time.Now().UnixNano(), level)
		code, body := admin.api(t, http.MethodPost, "/api/auth/v1/users", map[string]string{"username": name, "password": password, "level": level})
		if code >= 300 {
			t.Fatalf("creating %s: %d %s", name, code, body)
		}
		t.Cleanup(func() {
			if code, body := admin.api(t, http.MethodDelete, "/api/auth/v1/users/"+name, nil); code >= 300 {
				t.Errorf("deleting %s: %d %s", name, code, body)
			}
		})
		accounts[level] = loginAs(t, name, password)
	}
	adminConn := admin.adminConn(t)
	room, found := roomID(t, adminConn)
	if !found {
		t.Fatalf("%s is gone", ciRoom)
	}

	// configure: names and rooms with its own session (meta:write)
	configure := accounts["configure"].conn(t, "admin")
	renamed := ciRoom + " (configure)"
	ok(t, call(t, configure, message{"type": "renameGroup", "list": "rooms", "id": room, "name": renamed}))
	rooms, _ := ok(t, call(t, adminConn, message{"type": "getRooms"}))["rooms"].([]interface{})
	seen := false
	for _, r := range rooms {
		seen = seen || r.(map[string]interface{})["name"] == renamed
	}
	if !seen {
		t.Fatalf("the rename by ci-configure did not reach occulited: %v", rooms)
	}
	ok(t, call(t, configure, message{"type": "renameGroup", "list": "rooms", "id": room, "name": ciRoom}))
	// ... but no heating groups and no deleting devices
	refused(t, call(t, configure, message{"type": "saveHeatingGroup", "group": message{"name": ciGroup, "type": "hmip.heating.group", "members": []string{}}}))
	refused(t, call(t, configure, message{"type": "deleteDevice", "interfaceName": "VirtualDevices", "address": "INT0000001"}))

	// operate: no changes to names and rooms
	operate := accounts["operate"].conn(t, "user")
	refused(t, call(t, operate, message{"type": "renameGroup", "list": "rooms", "id": room, "name": renamed}))
	refused(t, call(t, operate, message{"type": "createGroup", "list": "rooms", "name": "CI operate"}))

	// administer: a heating group through occulited's system API, with the
	// administrator's session; its virtual device lives in hmipserver
	// (VirtualDevices), which runs without a radio module. The types are
	// what hmipserver offers: without an HmIP module only HomeMatic.heating
	code, body := admin.api(t, http.MethodGet, "/api/system/v1/groups/types", nil)
	var types struct {
		Types []struct {
			ID string `json:"id"`
		} `json:"types"`
	}
	if err := json.Unmarshal(body, &types); code != http.StatusOK || err != nil {
		t.Fatalf("group types: %d %s", code, body)
	}
	group := 0
	if len(types.Types) == 0 {
		t.Log("hmipserver offers no heating group type on this VM")
	} else {
		groupType := types.Types[0].ID
		m := ok(t, call(t, adminConn, message{"type": "saveHeatingGroup", "group": message{"name": ciGroup, "type": groupType, "members": []string{}}}))
		group = int(m["id"].(float64))
		t.Logf("heating group %d (%s)", group, groupType)
	}
	if group != 0 {
		defer func() { ok(t, call(t, adminConn, message{"type": "deleteHeatingGroup", "id": group})) }()
		groups, _ := ok(t, call(t, adminConn, message{"type": "getHeatingGroups"}))["groups"].([]interface{})
		seen := false
		for _, g := range groups {
			seen = seen || g.(map[string]interface{})["name"] == ciGroup
		}
		if !seen {
			t.Fatalf("%q not in the heating groups (umlauts lost?): %v", ciGroup, groups)
		}
		refused(t, call(t, configure, message{"type": "deleteHeatingGroup", "id": group}))
	}

	// lite-rpc with the user's session: MUI's device list for configure is
	// the one occulited's JSON-RPC gives that session directly. listDevices
	// in MUI leaves out an interface that fails, so a refused session shows
	// as devices missing
	code, body = accounts["configure"].api(t, http.MethodPost, "/api/rpc/v1/json/VirtualDevices", message{"jsonrpc": "2.0", "method": "listDevices", "params": []interface{}{}, "id": 1})
	var direct struct {
		Result []map[string]interface{} `json:"result"`
		Error  interface{}              `json:"error"`
	}
	if err := json.Unmarshal(body, &direct); code != http.StatusOK || err != nil || direct.Error != nil {
		t.Fatalf("lite-rpc listDevices as ci-configure: %d %s", code, body)
	}
	want := 0
	for _, d := range direct.Result {
		if d["PARENT"] == "" || d["PARENT"] == nil {
			want++
		}
	}
	got := 0
	devices, _ := ok(t, call(t, configure, message{"type": "listDevices"}))["devices"].([]interface{})
	for _, d := range devices {
		if d.(map[string]interface{})["interfaceName"] == "VirtualDevices" {
			got++
		}
	}
	t.Logf("VirtualDevices: %d devices through lite-rpc, %d in MUI", want, got)
	if got != want {
		t.Fatalf("MUI lists %d devices of VirtualDevices, lite-rpc %d", got, want)
	}
	if group == 0 {
		return
	}
	if want == 0 {
		t.Fatal("the heating group's device is not in VirtualDevices")
	}
	var device string
	var channels []string
	for _, d := range direct.Result {
		if d["PARENT"] == "" || d["PARENT"] == nil {
			device = fmt.Sprint(d["ADDRESS"])
		}
	}
	for _, d := range direct.Result {
		if d["PARENT"] == device {
			channels = append(channels, fmt.Sprint(d["ADDRESS"]))
		}
	}
	values(t, configure, operate, device, channels)
	settings(t, configure, operate, device, channels)
}

// writable picks a parameter of the paramset to change: FLOAT, INTEGER or
// BOOL, readable and writable (operations 1 and 2), not internal (flag 2);
// a temperature first. Its description and whether there is one.
func writable(description map[string]interface{}) (string, map[string]interface{}, bool) {
	best := ""
	for name, raw := range description {
		p := raw.(map[string]interface{})
		operations, _ := p["operations"].(float64)
		flags, _ := p["flags"].(float64)
		kind := p["type"]
		if int(operations)&3 != 3 || int(flags)&2 != 0 || (kind != "FLOAT" && kind != "INTEGER" && kind != "BOOL") {
			continue
		}
		if best == "" || (strings.Contains(name, "TEMPERATURE") && !strings.Contains(best, "TEMPERATURE")) || (strings.Contains(name, "TEMPERATURE") == strings.Contains(best, "TEMPERATURE") && name < best) {
			best = name
		}
	}
	if best == "" {
		return "", nil, false
	}
	return best, description[best].(map[string]interface{}), true
}

// another is a valid value of the parameter that differs from current
func another(p map[string]interface{}, current interface{}) interface{} {
	switch p["type"] {
	case "BOOL":
		return current != true
	case "INTEGER":
		min, max := p["min"].(float64), p["max"].(float64)
		if c, ok := current.(float64); ok && c+1 <= max {
			return c + 1
		}
		return min
	default:
		min, max := p["min"].(float64), p["max"].(float64)
		value := min + (max-min)/2
		if c, ok := current.(float64); ok && c == value {
			value = min
		}
		return float64(int(value*2)) / 2
	}
}

// same compares values the way they come back as JSON
func same(a, b interface{}) bool {
	fa, oka := a.(float64)
	fb, okb := b.(float64)
	if oka && okb {
		return fa-fb < 0.01 && fb-fa < 0.01
	}
	return a == b
}

// values: an operate account sets a value of the heating group's device
// through MUI (lite-rpc setValue with its own session, rpc:operate), and the
// value comes back as an event through occulited's event stream to a
// subscribed connection
func values(t *testing.T, configure, operate *websocket.Conn, device string, channels []string) {
	// What a user sets: a temperature on a channel of its own, not channel
	// 0 (hmipserver's virtual group device fails INHIBIT there with a Java
	// NullPointerException, Fault -321)
	var channel, name string
	var p map[string]interface{}
	for _, address := range channels {
		if strings.HasSuffix(address, ":0") {
			continue
		}
		description, _ := ok(t, call(t, configure, message{"type": "getParamsetDescription", "interfaceName": "VirtualDevices", "address": address, "paramsetKey": "VALUES"}))["description"].(map[string]interface{})
		n, d, found := writable(description)
		if found && (channel == "" || (strings.Contains(n, "TEMPERATURE") && !strings.Contains(name, "TEMPERATURE"))) {
			channel, name, p = address, n, d
		}
	}
	if channel == "" {
		t.Fatalf("no writable value on the heating group's channels %v", channels)
	}
	current := ok(t, call(t, configure, message{"type": "getParamset", "interfaceName": "VirtualDevices", "address": channel, "paramsetKey": "VALUES"}))["values"].(map[string]interface{})[name]
	value := another(p, current)
	ok(t, call(t, operate, message{"type": "subscribe", "channels": []string{channel}}))
	answer := call(t, operate, message{"type": "setDatapoint", "interfaceName": "VirtualDevices", "address": channel, "attribute": name, "value": value})
	if answer["success"] != true {
		t.Fatalf("setDatapoint %s %s = %v as ci-operate: %v", channel, name, value, answer)
	}
	_ = operate.SetReadDeadline(time.Now().Add(30 * time.Second))
	for {
		var m message
		if err := operate.ReadJSON(&m); err != nil {
			t.Fatalf("no event for %s %s = %v within 30 s: %v", channel, name, value, err)
		}
		event, _ := m["event"].(map[string]interface{})
		if event != nil && event["channel"] == channel && event["datapoint"] == name && same(event["value"], value) {
			t.Logf("%s %s = %v (was %v): set as ci-operate, the event came back", channel, name, value, current)
			return
		}
	}
}

// settings: configure changes a setting of the heating group's device
// (putParamset MASTER through lite-rpc with its own session, rpc:configure)
// and puts it back; operate may not
func settings(t *testing.T, configure, operate *websocket.Conn, device string, channels []string) {
	for _, address := range append([]string{device}, channels...) {
		description, _ := ok(t, call(t, configure, message{"type": "getParamsetDescription", "interfaceName": "VirtualDevices", "address": address, "paramsetKey": "MASTER"}))["description"].(map[string]interface{})
		name, p, found := writable(description)
		if !found {
			continue
		}
		read := func() interface{} {
			return ok(t, call(t, configure, message{"type": "getParamset", "interfaceName": "VirtualDevices", "address": address, "paramsetKey": "MASTER"}))["values"].(map[string]interface{})[name]
		}
		current := read()
		value := another(p, current)
		refused(t, call(t, operate, message{"type": "putParamset", "interfaceName": "VirtualDevices", "address": address, "paramsetKey": "MASTER", "values": message{name: value}}))
		ok(t, call(t, configure, message{"type": "putParamset", "interfaceName": "VirtualDevices", "address": address, "paramsetKey": "MASTER", "values": message{name: value}}))
		if got := read(); !same(got, value) {
			t.Fatalf("%s MASTER %s: wrote %v, read %v", address, name, value, got)
		}
		ok(t, call(t, configure, message{"type": "putParamset", "interfaceName": "VirtualDevices", "address": address, "paramsetKey": "MASTER", "values": message{name: current}}))
		t.Logf("%s MASTER %s: %v → %v and back, as ci-configure", address, name, current, value)
		return
	}
	t.Logf("no writable setting on the heating group's device %s", device)
}

// fresh: after an uninstall the add-on's data directory is empty, so the
// new install starts without the layout and the language; the room belongs
// to occulited's store and stays
func fresh(t *testing.T, v *vm) {
	conn := v.adminConn(t)
	id, found := roomID(t, conn)
	if !found {
		t.Fatalf("%s is gone from occulited's store", ciRoom)
	}
	if m := ok(t, call(t, conn, message{"type": "getLayout", "id": id})); m["layout"] != "" && m["layout"] != nil {
		t.Fatalf("layout still there after the uninstall: %v", m)
	}
	if m := ok(t, call(t, conn, message{"type": "getUserLanguage"})); m["language"] == 2.0 {
		t.Fatalf("language still there after the uninstall: %v", m)
	}
	ok(t, call(t, conn, message{"type": "deleteGroup", "list": "rooms", "id": id}))
}

func logout(t *testing.T, v *vm) {
	conn := v.adminConn(t)
	// A state-changing call on the session cookie needs X-Occulite-Request
	// (occulited docs/system-api.md, /api/auth/v1), as the shell sends it
	request, _ := http.NewRequest(http.MethodPost, v.base+"/api/auth/v1/logout", nil)
	request.Header.Set("Authorization", "Bearer "+v.sid)
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
