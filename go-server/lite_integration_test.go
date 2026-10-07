//go:build lite

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/fakeccu"
	"github.com/gorilla/websocket"
)

// liteStack is the server built for openccu-lite against the fake's
// openccu-lite: occulited's APIs instead of the ReGa and the WebUI
type liteStack struct {
	ccu    *fakeccu.CCU
	wsPort int
}

func litePort(t *testing.T) int {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port
}

func startLiteStack(t *testing.T) *liteStack {
	t.Helper()
	t.Setenv("LITE_FORCE", "1")
	fixture, err := fakeccu.LoadFixture("../fixtures/demo-ccu.json")
	if err != nil {
		t.Fatal(err)
	}
	ccu := fakeccu.New(fixture)
	ccu.Lite = true
	if err := ccu.Start("127.0.0.1"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(ccu.Close)

	data := t.TempDir()
	tokenFile := filepath.Join(t.TempDir(), "mui.api")
	_ = os.WriteFile(tokenFile, []byte(fakeccu.LiteAddonToken+"\n"), 0o600)
	cfg := &config.Config{
		WSBindHost:         "127.0.0.1",
		RPCPort:            ccu.InterfacePorts["BidCos-RF"],
		HmIPPort:           ccu.InterfacePorts["HmIP-RF"],
		VirtualDevicesPort: ccu.InterfacePorts["VirtualDevices"],
		WiredPort:          ccu.InterfacePorts["BidCos-Wired"],
		CCUHost:            "127.0.0.1",
		CallbackHost:       "127.0.0.1",
		AuthMode:           "ccu",
		DataDir:            data,
		AuthKeyFile:        filepath.Join(data, "mui-auth.key"),
		AuditLogFile:       filepath.Join(data, "mui-audit.log"),
		SessionsFile:       filepath.Join(data, "mui-sessions.json"),
		PushFile:           filepath.Join(data, "mui-push.json"),
		RulesFile:          filepath.Join(data, "mui-rules.json"),
		DiagramsFile:       filepath.Join(data, "mui-diagrams.json"),
		DiagramsDir:        filepath.Join(data, "mui-diagrams"),
		PushSubject:        "mailto:test@example.com",
		OcculiteURL:        fmt.Sprintf("http://127.0.0.1:%d", ccu.WebUIPort),
		OcculiteTokenFile:  tokenFile,
	}
	cfg.WSPort, cfg.RPCServerPort = litePort(t), litePort(t)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		if err := run(ctx, cfg); err != nil {
			t.Error(err)
		}
	}()
	t.Cleanup(func() {
		cancel()
		<-done
	})
	stack := &liteStack{ccu: ccu, wsPort: cfg.WSPort}
	// Up once a connection is accepted
	for i := 0; i < 100; i++ {
		if conn, err := stack.dial(""); err == nil {
			conn.Close()
			return stack
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("server did not start")
	return nil
}

// dial connects as the session gate passes it on: with the session in
// X-Occulite-Session, or without one
func (s *liteStack) dial(session string) (*websocket.Conn, error) {
	header := http.Header{}
	if session != "" {
		header.Set("X-Occulite-Session", session)
	}
	dialer := websocket.Dialer{HandshakeTimeout: 2 * time.Second}
	conn, _, err := dialer.Dial(fmt.Sprintf("ws://127.0.0.1:%d/addons/mui/ws", s.wsPort), header)
	return conn, err
}

// call sends a request and returns the answer with its requestId
func liteCall(t *testing.T, conn *websocket.Conn, request map[string]interface{}) map[string]interface{} {
	t.Helper()
	request["requestId"] = fmt.Sprint(time.Now().UnixNano())
	request["deviceId"] = "test"
	if err := conn.WriteJSON(request); err != nil {
		t.Fatal(err)
	}
	_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	for {
		var answer map[string]interface{}
		if err := conn.ReadJSON(&answer); err != nil {
			t.Fatalf("%v: %v", request["type"], err)
		}
		if answer["requestId"] == request["requestId"] || (request["type"] == "auth" && answer["type"] == "auth_response") {
			return answer
		}
	}
}

func TestLiteLoginThroughTheGate(t *testing.T) {
	stack := startLiteStack(t)

	admin, err := stack.dial(fakeccu.LiteSession("Admin"))
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	m := liteCall(t, admin, map[string]interface{}{"type": "auth"})
	capabilities, _ := m["capabilities"].(map[string]interface{})
	if m["success"] != true || m["user"] != "Admin" || m["level"] != "admin" || m["platform"] != "lite" || capabilities["programs"] != false {
		t.Fatalf("admin: %v", m)
	}
	// What only a CCU has is not there
	if m := liteCall(t, admin, map[string]interface{}{"type": "getSysvars"}); m["type"] != "error" {
		t.Fatalf("getSysvars on openccu-lite: %v", m)
	}

	guest, err := stack.dial(fakeccu.LiteSession("Gast"))
	if err != nil {
		t.Fatal(err)
	}
	defer guest.Close()
	if m := liteCall(t, guest, map[string]interface{}{"type": "auth"}); m["level"] != "guest" {
		t.Fatalf("guest: %v", m)
	}

	// Without the gate's session, or with a forged one, nothing goes
	for _, session := range []string{"", "FORGEDAAAAAAAAAAAAAAAAAAAA"} {
		conn, err := stack.dial(session)
		if err != nil {
			t.Fatal(err)
		}
		if m := liteCall(t, conn, map[string]interface{}{"type": "auth"}); m["success"] != false {
			t.Fatalf("%q: %v", session, m)
		}
		conn.Close()
	}
}

// The device list names the devices from occulited's metadata store
func TestLiteDeviceNames(t *testing.T) {
	stack := startLiteStack(t)
	conn, err := stack.dial(fakeccu.LiteSession("Admin"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	liteCall(t, conn, map[string]interface{}{"type": "auth"})
	m := liteCall(t, conn, map[string]interface{}{"type": "listDevices"})
	devices, _ := m["devices"].([]interface{})
	names := map[string]string{}
	for _, d := range devices {
		device := d.(map[string]interface{})
		name, _ := device["name"].(string)
		names[device["address"].(string)] = name
	}
	if names["000855699C4F38"] != "Taster Esszimmer" || names["00195F29B04142"] != "Zirkulationspumpe" {
		data, _ := json.Marshal(m)
		t.Fatalf("names: %s", data)
	}
}

// adminConn is a connection logged in as the fixture's administrator
func (s *liteStack) adminConn(t *testing.T) *websocket.Conn {
	t.Helper()
	conn, err := s.dial(fakeccu.LiteSession("Admin"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	liteCall(t, conn, map[string]interface{}{"type": "auth"})
	return conn
}

func findByName(t *testing.T, list interface{}, name string) map[string]interface{} {
	t.Helper()
	items, _ := list.([]interface{})
	for _, item := range items {
		if m := item.(map[string]interface{}); m["name"] == name {
			return m
		}
	}
	t.Fatalf("%q not in %v", name, list)
	return nil
}

// Rooms and functions are occulited's enums; a room's channels come from
// the interface processes, named by the metadata store, with values from
// the state store
func TestLiteRoomsAndChannels(t *testing.T) {
	stack := startLiteStack(t)
	conn := stack.adminConn(t)

	m := liteCall(t, conn, map[string]interface{}{"type": "getRooms"})
	room := findByName(t, m["rooms"], "Wohnzimmer")
	findByName(t, liteCall(t, conn, map[string]interface{}{"type": "getTrades"})["trades"], "Licht")

	m = liteCall(t, conn, map[string]interface{}{"type": "getChannels", "roomId": fmt.Sprint(int64(room["id"].(float64)))})
	channels, _ := m["channels"].([]interface{})
	var light map[string]interface{}
	for _, c := range channels {
		if c.(map[string]interface{})["address"] == "LEQ0000001:1" {
			light = c.(map[string]interface{})
		}
	}
	if light == nil {
		t.Fatalf("LEQ0000001:1 not in the room: %v", m)
	}
	if light["interfaceName"] != "BidCos-RF" || light["statusAddress"] != "LEQ0000001:0" {
		t.Fatalf("channel: %v", light)
	}
	if _, ok := light["datapoints"].(map[string]interface{})["STATE"]; !ok {
		t.Fatalf("no STATE: %v", light)
	}
}

// Switching goes to the interface process; its event comes back through
// openccu-lite's event stream, not a callback server
func TestLiteSwitchAndEvent(t *testing.T) {
	stack := startLiteStack(t)
	conn := stack.adminConn(t)
	if err := conn.WriteJSON(map[string]interface{}{"type": "subscribe", "deviceId": "test", "channels": []string{"LEQ0000001:1"}}); err != nil {
		t.Fatal(err)
	}
	if err := conn.WriteJSON(map[string]interface{}{"type": "setDatapoint", "requestId": "set", "interfaceName": "BidCos-RF", "address": "LEQ0000001:1", "attribute": "STATE", "value": true}); err != nil {
		t.Fatal(err)
	}
	// The event may come before the answer
	answered, evented := false, false
	deadline := time.Now().Add(10 * time.Second)
	for !(answered && evented) {
		var message map[string]interface{}
		_ = conn.SetReadDeadline(deadline)
		if err := conn.ReadJSON(&message); err != nil {
			t.Fatalf("answered %v, event %v: %v", answered, evented, err)
		}
		if message["requestId"] == "set" {
			if message["success"] != true {
				t.Fatalf("setDatapoint: %v", message)
			}
			answered = true
		}
		if event, ok := message["event"].(map[string]interface{}); ok && event["channel"] == "LEQ0000001:1" && event["datapoint"] == "STATE" && event["value"] == true {
			evented = true
		}
	}
}

// Rooms, names, layouts and favorite lists change in occulited's store or
// the add-on's own file
func TestLiteChanges(t *testing.T) {
	stack := startLiteStack(t)
	conn := stack.adminConn(t)

	if m := liteCall(t, conn, map[string]interface{}{"type": "createGroup", "list": "rooms", "name": "Gäste-WC"}); m["success"] != true {
		t.Fatalf("createGroup: %v", m)
	}
	room := findByName(t, liteCall(t, conn, map[string]interface{}{"type": "getRooms"})["rooms"], "Gäste-WC")
	roomID := int64(room["id"].(float64))

	channel := map[string]interface{}{}
	for _, c := range liteCall(t, conn, map[string]interface{}{"type": "getChannels", "all": true})["channels"].([]interface{}) {
		if c.(map[string]interface{})["address"] == "LEQ0000001:1" {
			channel = c.(map[string]interface{})
		}
	}
	channelID := int64(channel["id"].(float64))
	if m := liteCall(t, conn, map[string]interface{}{"type": "setGroupMember", "groupId": roomID, "channelId": channelID, "member": true}); m["success"] != true {
		t.Fatalf("setGroupMember: %v", m)
	}
	m := liteCall(t, conn, map[string]interface{}{"type": "getChannels", "roomId": fmt.Sprint(roomID)})
	if channels, _ := m["channels"].([]interface{}); len(channels) != 1 {
		t.Fatalf("room's channels: %v", m)
	}

	if m := liteCall(t, conn, map[string]interface{}{"type": "rename", "address": "LEQ0000001:1", "name": "Deckenlicht"}); m["success"] != true {
		t.Fatalf("rename: %v", m)
	}
	m = liteCall(t, conn, map[string]interface{}{"type": "getChannels", "roomId": fmt.Sprint(roomID)})
	if m["channels"].([]interface{})[0].(map[string]interface{})["name"] != "Deckenlicht" {
		t.Fatalf("not renamed: %v", m)
	}

	if m := liteCall(t, conn, map[string]interface{}{"type": "setLayout", "id": roomID, "layout": `{"v":2}`}); m["success"] != true {
		t.Fatalf("setLayout: %v", m)
	}
	if m := liteCall(t, conn, map[string]interface{}{"type": "getLayout", "id": roomID}); m["layout"] != `{"v":2}` {
		t.Fatalf("getLayout: %v", m)
	}

	m = liteCall(t, conn, map[string]interface{}{"type": "createFavorite", "name": "Abends"})
	if m["success"] != true {
		t.Fatalf("createFavorite: %v", m)
	}
	favorite := findByName(t, liteCall(t, conn, map[string]interface{}{"type": "getFavorites"})["favorites"], "Abends")
	if m := liteCall(t, conn, map[string]interface{}{"type": "addFavoriteItem", "id": favorite["id"], "itemId": channelID}); m["success"] != true {
		t.Fatalf("addFavoriteItem: %v", m)
	}
	m = liteCall(t, conn, map[string]interface{}{"type": "getChannels", "favoriteId": fmt.Sprint(int64(favorite["id"].(float64)))})
	if channels, _ := m["channels"].([]interface{}); len(channels) != 1 {
		t.Fatalf("favorite's channels: %v", m)
	}

	if m := liteCall(t, conn, map[string]interface{}{"type": "deleteGroup", "list": "rooms", "id": roomID}); m["success"] != true {
		t.Fatalf("deleteGroup: %v", m)
	}
}
