//go:build lite

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/fakeccu"
	"ccu-addon-mui-server/pkg/occulite"
)

// liteStack is the server built for openccu-lite against the fake's
// openccu-lite: occulited's APIs instead of the ReGa and the WebUI
type liteStack struct {
	ccu    *fakeccu.CCU
	wsPort int
	data   string
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
	// The recorder writes what is left when the server stops, without run
	// waiting for it: not in a directory the test must remove cleanly
	diagramsDir, err := os.MkdirTemp("", "mui-diagrams")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(diagramsDir) })
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
		TilesFile:          filepath.Join(data, "mui-tiles.json"),
		DiagramsDir:        diagramsDir,
		PushSubject:        "mailto:test@example.com",
		OcculiteURL:        fmt.Sprintf("http://127.0.0.1:%d", ccu.WebUIPort),
		OcculiteTokenFile:  tokenFile,
	}
	cfg.WSPort, cfg.RPCServerPort = freePort(t), freePort(t)
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
	stack := &liteStack{ccu: ccu, wsPort: cfg.WSPort, data: data}
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

// liteCall sends a request with a new requestId and returns its answer
func liteCall(t *testing.T, conn *websocket.Conn, request map[string]any) map[string]any {
	t.Helper()
	request["requestId"] = fmt.Sprint(time.Now().UnixNano())
	request["deviceId"] = "test"
	return call(t, conn, request)
}

func TestLiteLoginThroughTheGate(t *testing.T) {
	stack := startLiteStack(t)

	admin, err := stack.dial(fakeccu.LiteSession("Admin"))
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	m := liteCall(t, admin, map[string]any{"type": "auth"})
	capabilities, _ := m["capabilities"].(map[string]any)
	if m["success"] != true || m["user"] != "Admin" || m["level"] != "admin" || m["platform"] != "lite" || capabilities["programs"] != false {
		t.Fatalf("admin: %v", m)
	}
	// What only a CCU has is not there
	if m := liteCall(t, admin, map[string]any{"type": "getSysvars"}); m["type"] != "error" {
		t.Fatalf("getSysvars on openccu-lite: %v", m)
	}

	guest, err := stack.dial(fakeccu.LiteSession("Gast"))
	if err != nil {
		t.Fatal(err)
	}
	defer guest.Close()
	if m := liteCall(t, guest, map[string]any{"type": "auth"}); m["level"] != "guest" {
		t.Fatalf("guest: %v", m)
	}

	// Without the gate's session, or with a forged one, nothing goes
	for _, session := range []string{"", "FORGEDAAAAAAAAAAAAAAAAAAAA"} {
		conn, err := stack.dial(session)
		if err != nil {
			t.Fatal(err)
		}
		if m := liteCall(t, conn, map[string]any{"type": "auth"}); m["success"] != false {
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
	liteCall(t, conn, map[string]any{"type": "auth"})
	m := liteCall(t, conn, map[string]any{"type": "listDevices"})
	devices, _ := m["devices"].([]any)
	names := map[string]string{}
	for _, d := range devices {
		device := d.(map[string]any)
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
	liteCall(t, conn, map[string]any{"type": "auth"})
	return conn
}

func findByName(t *testing.T, list any, name string) map[string]any {
	t.Helper()
	items, _ := list.([]any)
	for _, item := range items {
		if m := item.(map[string]any); m["name"] == name {
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

	m := liteCall(t, conn, map[string]any{"type": "getRooms"})
	room := findByName(t, m["rooms"], "Wohnzimmer")
	findByName(t, liteCall(t, conn, map[string]any{"type": "getTrades"})["trades"], "Licht")

	m = liteCall(t, conn, map[string]any{"type": "getChannels", "roomId": fmt.Sprint(int64(room["id"].(float64)))})
	channels, _ := m["channels"].([]any)
	var light map[string]any
	for _, c := range channels {
		if c.(map[string]any)["address"] == "LEQ0000001:1" {
			light = c.(map[string]any)
		}
	}
	if light == nil {
		t.Fatalf("LEQ0000001:1 not in the room: %v", m)
	}
	if light["interfaceName"] != "BidCos-RF" || light["statusAddress"] != "LEQ0000001:0" {
		t.Fatalf("channel: %v", light)
	}
	if _, ok := light["datapoints"].(map[string]any)["STATE"]; !ok {
		t.Fatalf("no STATE: %v", light)
	}
}

// Switching goes to the interface process; its event comes back through
// openccu-lite's event stream, not a callback server
func TestLiteSwitchAndEvent(t *testing.T) {
	stack := startLiteStack(t)
	conn := stack.adminConn(t)
	if err := conn.WriteJSON(map[string]any{"type": "subscribe", "deviceId": "test", "channels": []string{"LEQ0000001:1"}}); err != nil {
		t.Fatal(err)
	}
	if err := conn.WriteJSON(map[string]any{"type": "setDatapoint", "requestId": "set", "interfaceName": "BidCos-RF", "address": "LEQ0000001:1", "attribute": "STATE", "value": true}); err != nil {
		t.Fatal(err)
	}
	// The event may come before the answer
	answered, evented := false, false
	deadline := time.Now().Add(10 * time.Second)
	for !(answered && evented) {
		var message map[string]any
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
		if event, ok := message["event"].(map[string]any); ok && event["channel"] == "LEQ0000001:1" && event["datapoint"] == "STATE" && event["value"] == true {
			evented = true
		}
	}
}

// Rooms, names, layouts and favorite lists change in occulited's store or
// the add-on's own file
func TestLiteChanges(t *testing.T) {
	stack := startLiteStack(t)
	conn := stack.adminConn(t)

	if m := liteCall(t, conn, map[string]any{"type": "createGroup", "list": "rooms", "name": "Gäste-WC"}); m["success"] != true {
		t.Fatalf("createGroup: %v", m)
	}
	room := findByName(t, liteCall(t, conn, map[string]any{"type": "getRooms"})["rooms"], "Gäste-WC")
	roomID := int64(room["id"].(float64))

	channel := map[string]any{}
	for _, c := range liteCall(t, conn, map[string]any{"type": "getChannels", "all": true})["channels"].([]any) {
		if c.(map[string]any)["address"] == "LEQ0000001:1" {
			channel = c.(map[string]any)
		}
	}
	channelID := int64(channel["id"].(float64))
	if m := liteCall(t, conn, map[string]any{"type": "setGroupMember", "groupId": roomID, "channelId": channelID, "member": true}); m["success"] != true {
		t.Fatalf("setGroupMember: %v", m)
	}
	m := liteCall(t, conn, map[string]any{"type": "getChannels", "roomId": fmt.Sprint(roomID)})
	if channels, _ := m["channels"].([]any); len(channels) != 1 {
		t.Fatalf("room's channels: %v", m)
	}

	if m := liteCall(t, conn, map[string]any{"type": "rename", "address": "LEQ0000001:1", "name": "Deckenlicht"}); m["success"] != true {
		t.Fatalf("rename: %v", m)
	}
	m = liteCall(t, conn, map[string]any{"type": "getChannels", "roomId": fmt.Sprint(roomID)})
	if m["channels"].([]any)[0].(map[string]any)["name"] != "Deckenlicht" {
		t.Fatalf("not renamed: %v", m)
	}

	if m := liteCall(t, conn, map[string]any{"type": "setLayout", "id": roomID, "layout": `{"v":2}`}); m["success"] != true {
		t.Fatalf("setLayout: %v", m)
	}
	if m := liteCall(t, conn, map[string]any{"type": "getLayout", "id": roomID}); m["layout"] != `{"v":2}` {
		t.Fatalf("getLayout: %v", m)
	}

	m = liteCall(t, conn, map[string]any{"type": "createFavorite", "name": "Abends"})
	if m["success"] != true {
		t.Fatalf("createFavorite: %v", m)
	}
	favorite := findByName(t, liteCall(t, conn, map[string]any{"type": "getFavorites"})["favorites"], "Abends")
	if m := liteCall(t, conn, map[string]any{"type": "addFavoriteItem", "id": favorite["id"], "itemId": channelID}); m["success"] != true {
		t.Fatalf("addFavoriteItem: %v", m)
	}
	m = liteCall(t, conn, map[string]any{"type": "getChannels", "favoriteId": fmt.Sprint(int64(favorite["id"].(float64)))})
	if channels, _ := m["channels"].([]any); len(channels) != 1 {
		t.Fatalf("favorite's channels: %v", m)
	}

	if m := liteCall(t, conn, map[string]any{"type": "deleteGroup", "list": "rooms", "id": roomID}); m["success"] != true {
		t.Fatalf("deleteGroup: %v", m)
	}
}

// A paired device without an object in the metadata store is new: it is in
// the inbox until it is accepted (it gets its object and name)
func TestLiteInbox(t *testing.T) {
	stack := startLiteStack(t)
	conn := stack.adminConn(t)
	m := liteCall(t, conn, map[string]any{"type": "getInbox"})
	devices, _ := m["devices"].([]any)
	if len(devices) == 0 {
		t.Fatalf("inbox empty: %v", m)
	}
	first := devices[0].(map[string]any)
	address := first["address"].(string)
	for _, d := range devices {
		if d.(map[string]any)["address"] == "000855699C4F38" {
			t.Fatalf("a named device in the inbox: %v", m)
		}
	}
	if m := liteCall(t, conn, map[string]any{"type": "acceptDevice", "address": address}); m["success"] != true {
		t.Fatalf("acceptDevice: %v", m)
	}
	for _, d := range liteCall(t, conn, map[string]any{"type": "getInbox"})["devices"].([]any) {
		if d.(map[string]any)["address"] == address {
			t.Fatalf("%s still in the inbox", address)
		}
	}
}

// Heating groups go through occulited's API, which names the group's
// device itself
func TestLiteHeatingGroups(t *testing.T) {
	stack := startLiteStack(t)
	conn := stack.adminConn(t)
	m := liteCall(t, conn, map[string]any{"type": "getHeatingGroupMembers", "groupType": "hmip.heating.group"})
	members := m["members"].(map[string]any)["assignable"].([]any)
	if len(members) != 1 || members[0].(map[string]any)["id"] != "000A9D89A7AF25:1" {
		t.Fatalf("members: %v", m)
	}
	m = liteCall(t, conn, map[string]any{"type": "saveHeatingGroup", "group": map[string]any{
		"id": 0, "name": "Erdgeschoss", "type": "hmip.heating.group", "members": []string{"000A9D89A7AF25:1"},
	}})
	if m["success"] != true || m["id"] != 1.0 {
		t.Fatalf("saveHeatingGroup: %v", m)
	}
	m = liteCall(t, conn, map[string]any{"type": "getHeatingGroups"})
	group := findByName(t, m["groups"], "Erdgeschoss")
	if group["deviceAddress"] != "INT0000001" || len(group["members"].([]any)) != 1 {
		t.Fatalf("group: %v", group)
	}
	if m := liteCall(t, conn, map[string]any{"type": "deleteHeatingGroup", "id": 1}); m["success"] != true {
		t.Fatalf("deleteHeatingGroup: %v", m)
	}
	if groups := liteCall(t, conn, map[string]any{"type": "getHeatingGroups"})["groups"].([]any); len(groups) != 0 {
		t.Fatalf("not deleted: %v", groups)
	}
}

// Service messages are occulited's; a sticky one ends by setting it false
// on the device. The device health comes from the maintenance values.
func TestLiteServiceMessagesAndHealth(t *testing.T) {
	stack := startLiteStack(t)
	conn := stack.adminConn(t)
	m := liteCall(t, conn, map[string]any{"type": "getServiceMessages"})
	var sticky map[string]any
	for _, item := range m["messages"].([]any) {
		if message := item.(map[string]any); message["type"] == "STICKY_UNREACH" && message["address"] == "0000DBE9A5C1F2" {
			sticky = message
		}
	}
	if sticky == nil {
		t.Fatalf("no STICKY_UNREACH: %v", m)
	}
	if m := liteCall(t, conn, map[string]any{"type": "acknowledgeServiceMessage", "id": sticky["id"]}); m["success"] != true {
		t.Fatalf("acknowledge: %v", m)
	}
	for _, item := range liteCall(t, conn, map[string]any{"type": "getServiceMessages"})["messages"].([]any) {
		if message := item.(map[string]any); message["type"] == "STICKY_UNREACH" && message["address"] == "0000DBE9A5C1F2" {
			t.Fatalf("still there: %v", message)
		}
	}

	m = liteCall(t, conn, map[string]any{"type": "getDeviceHealth"})
	for _, item := range m["devices"].([]any) {
		device := item.(map[string]any)
		if device["address"] != "0000DBE9A5C1F2" {
			continue
		}
		values := device["values"].(map[string]any)
		if values["RSSI_DEVICE"].(map[string]any)["value"] != -62.0 {
			t.Fatalf("health: %v", device)
		}
		return
	}
	t.Fatalf("0000DBE9A5C1F2 not in the health list: %v", m)
}

// Notification rules and push need no ReGa: they work from the interfaces'
// values and events and the add-on's own files
func TestLiteRulesAndPush(t *testing.T) {
	stack := startLiteStack(t)
	conn := stack.adminConn(t)
	rule := map[string]any{"name": "Licht an", "enabled": true, "minutes": 0, "message": "Licht ist an",
		"conditions": []any{map[string]any{
			"channelId": 1, "interfaceName": "BidCos-RF", "address": "LEQ0000001:1", "datapoint": "STATE", "op": "eq", "value": 1,
		}}}
	if m := liteCall(t, conn, map[string]any{"type": "saveRule", "rule": rule}); m["success"] != true {
		t.Fatalf("saveRule: %v", m)
	}
	if rules, _ := liteCall(t, conn, map[string]any{"type": "getRules"})["rules"].([]any); len(rules) != 1 {
		t.Fatalf("getRules: %v", rules)
	}
	if m := liteCall(t, conn, map[string]any{"type": "getPush"}); m["type"] == "error" {
		t.Fatalf("getPush: %v", m)
	}
}

// The central's virtual keys come from the interface processes, named in
// the metadata store, and are pressed like any channel
func TestLiteVirtualKeys(t *testing.T) {
	stack := startLiteStack(t)
	conn := stack.adminConn(t)
	m := liteCall(t, conn, map[string]any{"type": "getVirtualKeys"})
	key := findByName(t, m["keys"], "Alles aus")
	if key["address"] != "BidCoS-RF:1" || key["interfaceName"] != "BidCos-RF" {
		t.Fatalf("key: %v", key)
	}
	findByName(t, m["keys"], "Gute Nacht")
	if m := liteCall(t, conn, map[string]any{"type": "setDatapoint", "interfaceName": "BidCos-RF", "address": "BidCoS-RF:1", "attribute": "PRESS_SHORT", "value": true}); m["success"] != true {
		t.Fatalf("press: %v", m)
	}
	// Not tiles of the home
	for _, c := range liteCall(t, conn, map[string]any{"type": "getChannels", "all": true})["channels"].([]any) {
		if c.(map[string]any)["address"] == "BidCoS-RF:1" {
			t.Fatal("virtual key among the channels")
		}
	}
}

// patchObject changes an object in the fake's metadata store, as
// openccu-lite's own pages would
func (s *liteStack) patchObject(t *testing.T, ref string, patch map[string]any) {
	t.Helper()
	body, _ := json.Marshal(patch)
	req, _ := http.NewRequest(http.MethodPatch, fmt.Sprintf("http://127.0.0.1:%d/api/meta/v1/objects/%s", s.ccu.WebUIPort, ref), bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+fakeccu.LiteAddonToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PATCH %s: %d", ref, resp.StatusCode)
	}
}

// Rooms are the channel's: a room on the device object does not reach its
// channels, as in occulited's own app; adding and removing changes the
// channel object
func TestLiteChannelRooms(t *testing.T) {
	stack := startLiteStack(t)
	conn := stack.adminConn(t)
	roomOf := func(name string) int64 {
		if m := liteCall(t, conn, map[string]any{"type": "createGroup", "list": "rooms", "name": name}); m["success"] != true {
			t.Fatalf("createGroup: %v", m)
		}
		return int64(findByName(t, liteCall(t, conn, map[string]any{"type": "getRooms"})["rooms"], name)["id"].(float64))
	}
	keller, flur := roomOf("Keller"), roomOf("Flur")
	stack.patchObject(t, "BidCos-RF.LEQ0000001", map[string]any{"name": "Licht Wohnzimmer", "enums": []string{"room/keller"}})
	stack.patchObject(t, "BidCos-RF.LEQ0000001:1", map[string]any{"enums": []string{}})

	var channelID int64
	for _, c := range liteCall(t, conn, map[string]any{"type": "getChannels", "all": true})["channels"].([]any) {
		if c := c.(map[string]any); c["address"] == "LEQ0000001:1" {
			channelID = int64(c["id"].(float64))
		}
	}
	in := func(room int64) bool {
		for _, c := range liteCall(t, conn, map[string]any{"type": "getChannels", "roomId": fmt.Sprint(room)})["channels"].([]any) {
			if c.(map[string]any)["address"] == "LEQ0000001:1" {
				return true
			}
		}
		return false
	}
	member := func(room int64, on bool) {
		if m := liteCall(t, conn, map[string]any{"type": "setGroupMember", "groupId": room, "channelId": channelID, "member": on}); m["success"] != true {
			t.Fatalf("setGroupMember: %v", m)
		}
	}
	if in(keller) {
		t.Fatal("the device's room reaches its channel")
	}
	member(flur, true)
	if !in(flur) || in(keller) {
		t.Fatalf("after adding: Flur %v, Keller %v", in(flur), in(keller))
	}
	member(flur, false)
	if in(flur) {
		t.Fatal("still in Flur after removing")
	}
}

// What a CCU does differently works or says why on openccu-lite
func TestLiteLimits(t *testing.T) {
	stack := startLiteStack(t)
	conn := stack.adminConn(t)

	// A diagram with a new series: the current value instead of the ReGa's
	// system protocol
	m := liteCall(t, conn, map[string]any{"type": "saveDiagram", "diagram": map[string]any{
		"name": "Licht", "series": []map[string]any{{"address": "LEQ0000001:1", "datapoint": "STATE"}},
	}})
	if m["success"] != true {
		t.Fatalf("saveDiagram: %v", m)
	}

	// The language is the add-on's own data
	if m := liteCall(t, conn, map[string]any{"type": "setUserLanguage", "language": 1}); m["success"] != true {
		t.Fatalf("setUserLanguage: %v", m)
	}
	if data, err := os.ReadFile(filepath.Join(stack.data, "userprofiles", "Admin.lang")); err != nil || strings.TrimSpace(string(data)) != "1" {
		t.Fatalf("language file: %q %v", data, err)
	}

	// Only sticky service messages end by acknowledging
	other := false
	for _, item := range liteCall(t, conn, map[string]any{"type": "getServiceMessages"})["messages"].([]any) {
		if message := item.(map[string]any); !strings.HasPrefix(message["type"].(string), "STICKY_") {
			if m := liteCall(t, conn, map[string]any{"type": "acknowledgeServiceMessage", "id": message["id"]}); m["code"] != "NOT_SUPPORTED" {
				t.Fatalf("acknowledge %v: %v", message["type"], m)
			}
			other = true
			break
		}
	}
	if !other {
		t.Fatal("no service message but sticky ones")
	}

	// HmIP pairing says the system's key mode, so the dialog offers what works
	m = liteCall(t, conn, map[string]any{"type": "getInstallMode", "interfaceName": "HmIP-RF"})
	if hmip, _ := m["hmip"].(map[string]any); hmip["keyserverMode"] != "LOCAL" || hmip["offlinePairing"] != false || hmip["deviceKeys"] != 2.0 {
		t.Fatalf("getInstallMode HmIP-RF: %v", m)
	}

	// Elevating: administrators are, nobody else
	if m := liteCall(t, conn, map[string]any{"type": "elevate", "password": ""}); m["success"] != true {
		t.Fatalf("admin elevate: %v", m)
	}
	user, err := stack.dial(fakeccu.LiteSession("Gast"))
	if err != nil {
		t.Fatal(err)
	}
	defer user.Close()
	liteCall(t, user, map[string]any{"type": "auth"})
	if m := liteCall(t, user, map[string]any{"type": "elevate", "password": ""}); m["success"] == true {
		t.Fatalf("guest elevated: %v", m)
	}
}

// What a user changes goes with the user's session through occulited's
// APIs (lite-rpc, the metadata API), what the server does by itself with
// the add-on's token; nothing talks to the interface processes' own ports
func TestLiteCallsWithTheUsersSession(t *testing.T) {
	stack := startLiteStack(t)
	conn := stack.adminConn(t)
	if m := liteCall(t, conn, map[string]any{"type": "setDatapoint", "interfaceName": "BidCos-RF", "address": "LEQ0000001:1", "attribute": "STATE", "value": true}); m["success"] != true {
		t.Fatalf("setDatapoint: %v", m)
	}
	if m := liteCall(t, conn, map[string]any{"type": "rename", "address": "LEQ0000001:1", "name": "Deckenlicht"}); m["success"] != true {
		t.Fatalf("rename: %v", m)
	}
	if n := stack.ccu.CallCount("lite-rpc Admin setValue"); n != 1 {
		t.Fatalf("setValue with the user's session: %d", n)
	}
	if n := stack.ccu.CallCount("meta PATCH Admin"); n != 1 {
		t.Fatalf("rename with the user's session: %d", n)
	}
	// Every call reached the interface through lite-rpc, none on its port
	for _, call := range []string{"BidCos-RF setValue", "BidCos-RF listDevices", "HmIP-RF listDevices"} {
		if direct, proxied := stack.ccu.CallCount(call), stack.ccu.CallCount("lite-rpc "+call); direct == 0 || direct != proxied {
			t.Fatalf("%s: %d calls, %d through lite-rpc", call, direct, proxied)
		}
	}
}

// occulite changes something as a user of openccu-lite's own pages would:
// with the admin's session on its API
func (s *liteStack) occulite(t *testing.T, method, path string, body any) {
	t.Helper()
	data, _ := json.Marshal(body)
	req, _ := http.NewRequest(method, fmt.Sprintf("http://127.0.0.1:%d%s", s.ccu.WebUIPort, path), bytes.NewReader(data))
	req.Header.Set("Authorization", "Bearer "+fakeccu.LiteSession("Admin"))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode >= 300 {
		t.Fatalf("%s %s: %d", method, path, resp.StatusCode)
	}
}

// eventually repeats check until it holds, for what arrives through a stream
func eventually(t *testing.T, what string, check func() bool) {
	t.Helper()
	for deadline := time.Now().Add(10 * time.Second); time.Now().Before(deadline); time.Sleep(50 * time.Millisecond) {
		if check() {
			return
		}
	}
	t.Fatal(what)
}

// A room moved in openccu-lite keeps its layout (node.moved on the change
// stream); deleting the room above it takes the layout with it, also for
// the rooms below (one node.deleted for the subtree)
func TestLiteLayoutsFollowRoomsMovedInOpenccuLite(t *testing.T) {
	stack := startLiteStack(t)
	conn := stack.adminConn(t)
	if m := liteCall(t, conn, map[string]any{"type": "createGroup", "list": "rooms", "name": "Etage"}); m["success"] != true {
		t.Fatalf("createGroup: %v", m)
	}
	room := findByName(t, liteCall(t, conn, map[string]any{"type": "getRooms"})["rooms"], "Wohnzimmer")
	oldID := int64(room["id"].(float64))
	if oldID != occulite.ID("room/wohnzimmer") {
		t.Fatalf("Wohnzimmer is not room/wohnzimmer: %v", room)
	}
	if m := liteCall(t, conn, map[string]any{"type": "setLayout", "id": oldID, "layout": `{"v":7}`}); m["success"] != true {
		t.Fatalf("setLayout: %v", m)
	}

	stack.occulite(t, http.MethodPatch, "/api/meta/v1/enums/room/nodes/wohnzimmer", map[string]any{"parent": "room/etage"})
	newID := occulite.ID("room/etage/wohnzimmer")
	eventually(t, "the moved room's layout did not follow", func() bool {
		return liteCall(t, conn, map[string]any{"type": "getLayout", "id": newID})["layout"] == `{"v":7}`
	})
	// The rooms say where it is now: the snapshot kept before the move went
	if room := findByName(t, liteCall(t, conn, map[string]any{"type": "getRooms"})["rooms"], "Wohnzimmer"); int64(room["id"].(float64)) != newID {
		t.Fatalf("rooms after the move: %v", room)
	}
	if layout := liteCall(t, conn, map[string]any{"type": "getLayout", "id": oldID})["layout"]; layout != "" && layout != nil {
		t.Fatalf("layout left at the old place: %v", layout)
	}

	stack.occulite(t, http.MethodDelete, "/api/meta/v1/enums/room/nodes/etage?members=detach", nil)
	eventually(t, "the layout of the room below the deleted one stayed", func() bool {
		layout := liteCall(t, conn, map[string]any{"type": "getLayout", "id": newID})["layout"]
		return layout == "" || layout == nil
	})
}

// resync on lite-rpc's event stream (events lost): the state store is read
// again, and events come on afterwards
func TestLiteResync(t *testing.T) {
	stack := startLiteStack(t)
	conn := stack.adminConn(t)
	const stateReads = "occulited GET /api/rpc/v1/state"
	eventually(t, "the state store was not read at start", func() bool { return stack.ccu.CallCount(stateReads) == 1 })
	// Sent to the streams connected at the time: again until it arrived
	eventually(t, "the state store was not read again after resync", func() bool {
		if stack.ccu.CallCount(stateReads) >= 2 {
			return true
		}
		stack.ccu.LiteResync("gap")
		return false
	})

	if err := conn.WriteJSON(map[string]any{"type": "subscribe", "deviceId": "test", "channels": []string{"LEQ0000001:1"}}); err != nil {
		t.Fatal(err)
	}
	// The stream is open again: a value changed on the device arrives. The
	// device reports until the event is read, as the new stream may still
	// be connecting (one read with one deadline: gorilla's connection is
	// spent after a read timeout)
	done := make(chan struct{})
	defer close(done)
	go func() {
		ticker := time.NewTicker(200 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				_ = stack.ccu.SetValue("BidCos-RF", "LEQ0000001:1", "STATE", true)
			}
		}
	}()
	_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	for {
		var message map[string]any
		if err := conn.ReadJSON(&message); err != nil {
			t.Fatalf("no event after resync: %v", err)
		}
		if event, ok := message["event"].(map[string]any); ok && event["channel"] == "LEQ0000001:1" && event["datapoint"] == "STATE" {
			return
		}
	}
}
