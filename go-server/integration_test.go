package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/santhosh-tekuri/jsonschema/v6"

	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/fakeccu"
)

func freePort(t *testing.T) int {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port
}

// startStack runs the fake CCU and the real server against it and returns
// a connected WebSocket client.
func startStack(t *testing.T, authMode string) (*fakeccu.CCU, *websocket.Conn) {
	t.Helper()
	fixture, err := fakeccu.LoadFixture("../fixtures/demo-ccu.json")
	if err != nil {
		t.Fatal(err)
	}
	ccu := fakeccu.New(fixture)
	if err := ccu.Start("127.0.0.1"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(ccu.Close)

	cfg := &config.Config{
		WSPort:             freePort(t),
		WSBindHost:         "127.0.0.1",
		RPCPort:            ccu.InterfacePorts["BidCos-RF"],
		HmIPPort:           ccu.InterfacePorts["HmIP-RF"],
		VirtualDevicesPort: ccu.InterfacePorts["VirtualDevices"],
		RPCServerPort:      freePort(t),
		CCUHost:            "127.0.0.1",
		CallbackHost:       "127.0.0.1",
		RegaPort:           ccu.RegaPort,
		AuthMode:           authMode,
		WebUIURL:           fmt.Sprintf("http://127.0.0.1:%d", ccu.WebUIPort),
		AuthKeyFile:        filepath.Join(t.TempDir(), "key"),
		AuditLogFile:       filepath.Join(t.TempDir(), "audit.log"),
		SessionsFile:       filepath.Join(t.TempDir(), "sessions.json"),
	}
	auditLogs[ccu] = cfg.AuditLogFile

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

	url := fmt.Sprintf("ws://127.0.0.1:%d/", cfg.WSPort)
	var conn *websocket.Conn
	for i := 0; i < 50; i++ {
		if conn, _, err = websocket.DefaultDialer.Dial(url, nil); err == nil {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if err != nil {
		t.Fatalf("server did not start: %v", err)
	}
	t.Cleanup(func() { conn.Close() })

	// Wait until the server registered with the interfaces, so events arrive
	deadline := time.Now().Add(5 * time.Second)
	for ccu.CallCount("HmIP-RF init") == 0 || ccu.CallCount("BidCos-RF init") == 0 {
		if time.Now().After(deadline) {
			t.Fatal("server did not register with the fake CCU")
		}
		time.Sleep(20 * time.Millisecond)
	}
	return ccu, conn
}

// auditLogs remembers the audit log file of each started stack
var auditLogs = map[*fakeccu.CCU]string{}

type message map[string]interface{}

func send(t *testing.T, conn *websocket.Conn, m message) {
	t.Helper()
	if err := conn.WriteJSON(m); err != nil {
		t.Fatal(err)
	}
}

var (
	protocolOnce   sync.Once
	protocolSchema *jsonschema.Schema
)

// serverMessageSchema is the definition of every server message in
// protocol/schema.json, which the TypeScript types are generated from.
func serverMessageSchema(t *testing.T) *jsonschema.Schema {
	t.Helper()
	protocolOnce.Do(func() {
		compiler := jsonschema.NewCompiler()
		data, err := os.ReadFile("../protocol/schema.json")
		if err != nil {
			t.Fatal(err)
		}
		doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
		if err != nil {
			t.Fatal(err)
		}
		if err := compiler.AddResource("schema.json", doc); err != nil {
			t.Fatal(err)
		}
		protocolSchema = compiler.MustCompile("schema.json#/definitions/ServerMessage")
	})
	return protocolSchema
}

// read reads the next message and checks it against the protocol schema:
// a server change that breaks the contract with the app fails here.
func read(t *testing.T, conn *websocket.Conn) (message, error) {
	t.Helper()
	_, data, err := conn.ReadMessage()
	if err != nil {
		return nil, err
	}
	instance, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("invalid JSON from the server: %s", data)
	}
	if err := serverMessageSchema(t).Validate(instance); err != nil {
		t.Fatalf("message does not match protocol/schema.json: %s\n%v", data, err)
	}
	var m message
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatal(err)
	}
	return m, nil
}

// receive reads messages until one matches.
func receive(t *testing.T, conn *websocket.Conn, match func(message) bool) message {
	t.Helper()
	_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	for {
		m, err := read(t, conn)
		if err != nil {
			t.Fatalf("no matching message: %v", err)
		}
		if match(m) {
			return m
		}
	}
}

// receiveAll reads messages until each matcher matched one, in any order:
// e.g. the CCU's event may arrive before the response to the command.
func receiveAll(t *testing.T, conn *websocket.Conn, matchers ...func(message) bool) []message {
	t.Helper()
	found := make([]message, len(matchers))
	missing := len(matchers)
	_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	for missing > 0 {
		m, err := read(t, conn)
		if err != nil {
			t.Fatalf("%d messages missing: %v", missing, err)
		}
		for i, match := range matchers {
			if found[i] == nil && match(m) {
				found[i] = m
				missing--
				break
			}
		}
	}
	return found
}

func isEvent(m message) bool { return m["event"] != nil }

func isSetDatapointResponse(m message) bool { return m["type"] == "setDatapoint_response" }

func byRequestID(id string) func(message) bool {
	return func(m message) bool { return m["requestId"] == id }
}

func TestStackLoginReadAndControl(t *testing.T) {
	ccu, conn := startStack(t, "ccu")

	send(t, conn, message{"type": "auth"})
	if m := receive(t, conn, func(m message) bool { return m["type"] == "auth_response" }); m["code"] != "LOGIN_REQUIRED" {
		t.Fatalf("expected login to be required, got %v", m)
	}

	send(t, conn, message{"type": "login", "username": "Admin", "password": "secret"})
	login := receive(t, conn, func(m message) bool { return m["type"] == "auth_response" })
	if login["success"] != true || login["level"] != "admin" {
		t.Fatalf("unexpected login response: %v", login)
	}

	send(t, conn, message{"type": "getRooms", "deviceId": "dev-1", "requestId": "q1"})
	rooms := receive(t, conn, byRequestID("q1"))["rooms"].([]interface{})
	if len(rooms) != 3 || rooms[1].(map[string]interface{})["name"] != "Küche" {
		t.Fatalf("unexpected rooms: %v", rooms)
	}

	send(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "roomId": "1", "requestId": "q2"})
	channels := receive(t, conn, byRequestID("q2"))["channels"].([]interface{})
	light := channels[0].(map[string]interface{})
	if len(channels) != 3 || light["name"] != "Wohnzimmer Licht" || light["statusAddress"] != "LEQ0000001:0" {
		t.Fatalf("unexpected channels: %v", channels)
	}

	// Switching goes through ReGa; the CCU's event comes back over XML-RPC
	send(t, conn, message{"type": "subscribe", "deviceId": "dev-1", "channels": []string{"LEQ0000001:1"}})
	send(t, conn, message{"type": "setDatapoint", "requestId": "1", "interfaceName": "BidCos-RF", "address": "LEQ0000001:1", "attribute": "STATE", "value": true})
	messages := receiveAll(t, conn, isSetDatapointResponse, isEvent)
	if messages[0]["success"] != true {
		t.Fatalf("setDatapoint failed: %v", messages[0])
	}
	event := messages[1]["event"].(map[string]interface{})
	if event["channel"] != "LEQ0000001:1" || event["datapoint"] != "STATE" || event["value"] != true {
		t.Fatalf("unexpected event: %v", event)
	}

	// A change on the device itself
	if err := ccu.SetValue("BidCos-RF", "LEQ0000001:1", "STATE", false); err != nil {
		t.Fatal(err)
	}
	event = receive(t, conn, func(m message) bool { return m["event"] != nil })["event"].(map[string]interface{})
	if event["value"] != false {
		t.Fatalf("unexpected event: %v", event)
	}

	// Paramset descriptions over XML-RPC
	send(t, conn, message{"type": "getParamsetDescription", "requestId": "q3", "interfaceName": "HmIP-RF", "address": "0000DBE9A5C1F2:1", "paramsetKey": "VALUES"})
	description := receive(t, conn, byRequestID("q3"))["description"].(map[string]interface{})
	state := description["STATE"].(map[string]interface{})
	if state["type"] != "ENUM" || len(state["valueList"].([]interface{})) != 3 {
		t.Fatalf("unexpected description: %v", description)
	}

	send(t, conn, message{"type": "getDeviceProblems", "requestId": "q4"})
	problems := receive(t, conn, byRequestID("q4"))["devices"].([]interface{})
	if len(problems) != 2 {
		t.Fatalf("unexpected device problems: %v", problems)
	}
}

func TestStackRefusesUnreachableDevice(t *testing.T) {
	ccu, conn := startStack(t, "none")
	send(t, conn, message{"type": "auth"})
	receive(t, conn, func(m message) bool { return m["type"] == "auth_response" })

	if err := ccu.SetValue("BidCos-RF", "LEQ0000001:0", "UNREACH", true); err != nil {
		t.Fatal(err)
	}
	send(t, conn, message{"type": "setDatapoint", "requestId": "1", "interfaceName": "BidCos-RF", "address": "LEQ0000001:1", "attribute": "STATE", "value": true})
	m := receive(t, conn, func(m message) bool { return m["type"] == "setDatapoint_response" })
	if m["success"] != false || m["code"] != "UNREACH" {
		t.Fatalf("expected UNREACH, got %v", m)
	}
}

func TestStackAllDevices(t *testing.T) {
	_, conn := startStack(t, "none")
	send(t, conn, message{"type": "auth"})
	receive(t, conn, func(m message) bool { return m["type"] == "auth_response" })

	send(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "all": true, "requestId": "q1"})
	resp := receive(t, conn, byRequestID("q1"))
	raw, _ := json.Marshal(resp["channels"])
	var channels []struct{ Address string }
	_ = json.Unmarshal(raw, &channels)
	for _, ch := range channels {
		if ch.Address[len(ch.Address)-2:] == ":0" {
			t.Fatalf("maintenance channel listed: %s", ch.Address)
		}
	}
	if len(channels) != 18 {
		t.Fatalf("expected all 18 channels, got %d", len(channels))
	}
}

func loginAs(t *testing.T, conn *websocket.Conn, user, password string) message {
	t.Helper()
	send(t, conn, message{"type": "login", "username": user, "password": password})
	return receive(t, conn, func(m message) bool { return m["type"] == "auth_response" })
}

func TestStackGuestMayNotControlAndChangesAreAudited(t *testing.T) {
	ccu, conn := startStack(t, "ccu")

	if m := loginAs(t, conn, "Gast", "gast"); m["level"] != "guest" {
		t.Fatalf("unexpected login: %v", m)
	}
	send(t, conn, message{"type": "setDatapoint", "requestId": "1", "interfaceName": "BidCos-RF", "address": "LEQ0000001:1", "attribute": "STATE", "value": true})
	if m := receive(t, conn, func(m message) bool { return m["type"] == "setDatapoint_response" }); m["success"] != false || m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", m)
	}

	if m := loginAs(t, conn, "Admin", "secret"); m["level"] != "admin" {
		t.Fatalf("unexpected login: %v", m)
	}
	send(t, conn, message{"type": "setDatapoint", "requestId": "2", "interfaceName": "BidCos-RF", "address": "LEQ0000001:1", "attribute": "STATE", "value": true})
	if m := receive(t, conn, isSetDatapointResponse); m["success"] != true {
		t.Fatalf("setDatapoint failed: %v", m)
	}

	data, err := os.ReadFile(auditLogs[ccu])
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	var entries []map[string]interface{}
	for _, line := range lines {
		var e map[string]interface{}
		if err := json.Unmarshal([]byte(line), &e); err != nil {
			t.Fatal(err)
		}
		entries = append(entries, e)
	}
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %v", entries)
	}
	if entries[0]["user"] != "Gast" || entries[0]["result"] != "FORBIDDEN" {
		t.Errorf("unexpected first entry: %v", entries[0])
	}
	if e := entries[1]; e["user"] != "Admin" || e["result"] != "OK" || e["target"] != "BidCos-RF.LEQ0000001:1.STATE" ||
		e["previous"] != "false" || e["value"] != true {
		t.Errorf("unexpected second entry: %v", e)
	}
}

func TestStackChangeDeviceSettings(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	put := func(id string, values map[string]interface{}) message {
		send(t, conn, message{"type": "putParamset", "requestId": id, "interfaceName": "HmIP-RF",
			"address": "0000DBE9A5C1F2:1", "paramsetKey": "MASTER", "values": values})
		return receive(t, conn, byRequestID(id))
	}

	if m := put("q1", map[string]interface{}{"EVENT_DELAY_UNIT": 2}); m["success"] != true {
		t.Fatalf("putParamset failed: %v", m)
	}
	send(t, conn, message{"type": "getParamset", "requestId": "q2", "interfaceName": "HmIP-RF", "address": "0000DBE9A5C1F2:1", "paramsetKey": "MASTER"})
	values := receive(t, conn, byRequestID("q2"))["values"].(map[string]interface{})
	if values["EVENT_DELAY_UNIT"] != 2.0 {
		t.Fatalf("value not stored: %v", values)
	}

	// Outside the value list: refused before it reaches the CCU
	if m := put("q3", map[string]interface{}{"EVENT_DELAY_UNIT": 7}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
	if ccu.CallCount("HmIP-RF putParamset") != 1 {
		t.Fatalf("expected one putParamset, got %d", ccu.CallCount("HmIP-RF putParamset"))
	}

	data, _ := os.ReadFile(auditLogs[ccu])
	if !strings.Contains(string(data), `"previous":{"EVENT_DELAY_UNIT":0}`) || !strings.Contains(string(data), `"result":"INVALID_VALUE"`) {
		t.Fatalf("unexpected audit log: %s", data)
	}
}

func TestStackListDevices(t *testing.T) {
	_, conn := startStack(t, "none")
	send(t, conn, message{"type": "auth"})
	receive(t, conn, func(m message) bool { return m["type"] == "auth_response" })

	send(t, conn, message{"type": "listDevices", "requestId": "q1"})
	devices := receive(t, conn, byRequestID("q1"))["devices"].([]interface{})
	types := map[string]string{}
	for _, raw := range devices {
		d := raw.(map[string]interface{})
		types[d["address"].(string)] = d["interfaceName"].(string) + " " + d["type"].(string)
	}
	if len(types) != 5 || types["0000DBE9A5C1F2"] != "HmIP-RF HmIP-SRH" || types["LEQ0000001"] != "BidCos-RF HM-LC-Sw1-FM" {
		t.Fatalf("unexpected devices: %v", types)
	}
}

func TestStackAdminTokenForSettings(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	login := loginAs(t, conn, "Admin", "secret")
	if login["elevated"] != true || login["adminToken"] == nil {
		t.Fatalf("an administrator who just entered the password may set up: %v", login)
	}
	token := login["token"].(string)

	put := func(c *websocket.Conn, id string) message {
		send(t, c, message{"type": "putParamset", "requestId": id, "interfaceName": "HmIP-RF",
			"address": "0000DBE9A5C1F2:1", "paramsetKey": "MASTER", "values": map[string]interface{}{"EVENT_DELAY_UNIT": 1}})
		return receive(t, c, byRequestID(id))
	}

	// A new connection (e.g. the wall tablet next morning) with the
	// long-lived token only: operating yes, setting up no
	url := fmt.Sprintf("ws://%s/", conn.RemoteAddr().String())
	tablet, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tablet.Close()
	send(t, tablet, message{"type": "auth", "token": token})
	if m := receive(t, tablet, func(m message) bool { return m["type"] == "auth_response" }); m["success"] != true || m["elevated"] != false {
		t.Fatalf("unexpected auth: %v", m)
	}
	if m := put(tablet, "q1"); m["code"] != "ELEVATION_REQUIRED" {
		t.Fatalf("expected ELEVATION_REQUIRED, got %v", m)
	}

	send(t, tablet, message{"type": "elevate", "requestId": "q2", "password": "wrong"})
	if m := receive(t, tablet, byRequestID("q2")); m["code"] != "INVALID_CREDENTIALS" {
		t.Fatalf("expected INVALID_CREDENTIALS, got %v", m)
	}
	send(t, tablet, message{"type": "elevate", "requestId": "q3", "password": "secret"})
	elevate := receive(t, tablet, byRequestID("q3"))
	if elevate["success"] != true || elevate["adminToken"] == nil {
		t.Fatalf("unexpected elevate response: %v", elevate)
	}
	if m := put(tablet, "q4"); m["success"] != true {
		t.Fatalf("putParamset failed: %v", m)
	}

	// After a reconnect the admin token keeps it elevated
	again, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer again.Close()
	send(t, again, message{"type": "auth", "token": token, "adminToken": elevate["adminToken"]})
	if m := receive(t, again, func(m message) bool { return m["type"] == "auth_response" }); m["elevated"] != true {
		t.Fatalf("expected the admin token to be accepted: %v", m)
	}
	if ccu.CallCount("HmIP-RF putParamset") != 1 {
		t.Fatalf("expected one putParamset, got %d", ccu.CallCount("HmIP-RF putParamset"))
	}
}

func TestStackRenameAndAssignRooms(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	send(t, conn, message{"type": "rename", "requestId": "q1", "address": "LEQ0000001:1", "name": "Deckenlicht"})
	if m := receive(t, conn, byRequestID("q1")); m["success"] != true || m["type"] != "rename_response" {
		t.Fatalf("rename failed: %v", m)
	}
	send(t, conn, message{"type": "rename", "requestId": "q2", "address": "LEQ0000001:1", "name": `Licht"; system.Exec("x`})
	if m := receive(t, conn, byRequestID("q2")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
	send(t, conn, message{"type": "rename", "requestId": "q3", "address": "0000DBE9A5C1F2", "name": "Griff"})
	receive(t, conn, byRequestID("q3"))

	// Move the light from the living room (1) to the kitchen (2)
	send(t, conn, message{"type": "setGroupMember", "requestId": "q4", "groupId": 2, "channelId": 101, "member": true})
	receive(t, conn, byRequestID("q4"))
	send(t, conn, message{"type": "setGroupMember", "requestId": "q5", "groupId": 1, "channelId": 101, "member": false})
	receive(t, conn, byRequestID("q5"))

	send(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "roomId": "2", "requestId": "q6"})
	channels := receive(t, conn, byRequestID("q6"))["channels"].([]interface{})
	var light map[string]interface{}
	for _, raw := range channels {
		if ch := raw.(map[string]interface{}); ch["address"] == "LEQ0000001:1" {
			light = ch
		}
	}
	if light == nil || light["name"] != "Deckenlicht" || fmt.Sprint(light["rooms"]) != "[2]" {
		t.Fatalf("unexpected channel in the kitchen: %v", light)
	}

	send(t, conn, message{"type": "listDevices", "requestId": "q7"})
	for _, raw := range receive(t, conn, byRequestID("q7"))["devices"].([]interface{}) {
		if d := raw.(map[string]interface{}); d["address"] == "0000DBE9A5C1F2" && d["name"] != "Griff" {
			t.Fatalf("device not renamed: %v", d)
		}
	}

	data, _ := os.ReadFile(auditLogs[ccu])
	if !strings.Contains(string(data), `"action":"rename","target":"LEQ0000001:1","previous":"Wohnzimmer Licht","value":"Deckenlicht"`) {
		t.Fatalf("rename not audited: %s", data)
	}
}

func TestStackPairingInboxAndDelete(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	send(t, conn, message{"type": "setInstallMode", "requestId": "q1", "interfaceName": "HmIP-RF", "on": true, "seconds": 60})
	if m := receive(t, conn, byRequestID("q1")); m["success"] != true {
		t.Fatalf("setInstallMode failed: %v", m)
	}
	send(t, conn, message{"type": "getInstallMode", "requestId": "q2", "interfaceName": "HmIP-RF"})
	if seconds := receive(t, conn, byRequestID("q2"))["seconds"]; seconds == nil || seconds.(float64) < 50 {
		t.Fatalf("install mode not on: %v", seconds)
	}

	send(t, conn, message{"type": "getInbox", "requestId": "q3"})
	inbox := receive(t, conn, byRequestID("q3"))["devices"].([]interface{})
	if len(inbox) != 1 || inbox[0].(map[string]interface{})["type"] != "HmIP-SWDO" {
		t.Fatalf("unexpected inbox: %v", inbox)
	}
	send(t, conn, message{"type": "acceptDevice", "requestId": "q4", "address": "0008DA8A9F1234"})
	if m := receive(t, conn, byRequestID("q4")); m["success"] != true {
		t.Fatalf("acceptDevice failed: %v", m)
	}
	send(t, conn, message{"type": "getInbox", "requestId": "q5"})
	if devices := receive(t, conn, byRequestID("q5"))["devices"]; devices != nil {
		t.Fatalf("inbox not empty: %v", devices)
	}

	send(t, conn, message{"type": "deleteDevice", "requestId": "q6", "interfaceName": "HmIP-RF", "address": "0008DA8A9F1234", "reset": true})
	if m := receive(t, conn, byRequestID("q6")); m["success"] != true {
		t.Fatalf("deleteDevice failed: %v", m)
	}
	send(t, conn, message{"type": "listDevices", "requestId": "q7"})
	for _, raw := range receive(t, conn, byRequestID("q7"))["devices"].([]interface{}) {
		if raw.(map[string]interface{})["address"] == "0008DA8A9F1234" {
			t.Fatal("device not deleted")
		}
	}
	if ccu.CallCount("HmIP-RF deleteDevice") != 1 {
		t.Fatal("deleteDevice not called")
	}

	// Guests may not pair
	loginAs(t, conn, "Gast", "gast")
	send(t, conn, message{"type": "setInstallMode", "requestId": "q8", "interfaceName": "HmIP-RF", "on": true, "seconds": 60})
	if m := receive(t, conn, byRequestID("q8")); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", m)
	}
}

func TestStackSysvarsAndPrograms(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	send(t, conn, message{"type": "getSysvars", "requestId": "q1"})
	sysvars := receive(t, conn, byRequestID("q1"))["sysvars"].([]interface{})
	if len(sysvars) != 6 {
		t.Fatalf("unexpected sysvars: %v", sysvars)
	}
	mode := sysvars[2].(map[string]interface{})
	if mode["kind"] != "enum" || mode["value"] != 1.0 || len(mode["valueList"].([]interface{})) != 3 {
		t.Fatalf("unexpected mode: %v", mode)
	}

	send(t, conn, message{"type": "setSysvar", "requestId": "q2", "id": 952, "value": 2})
	if m := receive(t, conn, byRequestID("q2")); m["success"] != true {
		t.Fatalf("setSysvar failed: %v", m)
	}
	send(t, conn, message{"type": "setSysvar", "requestId": "q3", "id": 953, "value": `x"); system.Exec("y`})
	if m := receive(t, conn, byRequestID("q3")); m["code"] != "CCU_ERROR" {
		t.Fatalf("expected the injection to be refused, got %v", m)
	}
	send(t, conn, message{"type": "getSysvars", "requestId": "q4"})
	if v := receive(t, conn, byRequestID("q4"))["sysvars"].([]interface{})[2].(map[string]interface{})["value"]; v != 2.0 {
		t.Fatalf("sysvar not set: %v", v)
	}

	send(t, conn, message{"type": "getPrograms", "requestId": "q5"})
	if programs := receive(t, conn, byRequestID("q5"))["programs"].([]interface{}); len(programs) != 3 {
		t.Fatalf("unexpected programs: %v", programs)
	}
	send(t, conn, message{"type": "runProgram", "requestId": "q6", "id": 1200})
	receive(t, conn, byRequestID("q6"))
	if ccu.ProgramRuns(1200) != 1 {
		t.Fatal("program not run")
	}
	send(t, conn, message{"type": "setProgramActive", "requestId": "q7", "id": 1202, "active": true})
	if m := receive(t, conn, byRequestID("q7")); m["success"] != true {
		t.Fatalf("setProgramActive failed: %v", m)
	}

	// Guests may look, not act
	loginAs(t, conn, "Gast", "gast")
	send(t, conn, message{"type": "runProgram", "requestId": "q8", "id": 1200})
	if m := receive(t, conn, byRequestID("q8")); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", m)
	}
}

func TestStackLogOutDevices(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	url := fmt.Sprintf("ws://%s/", conn.RemoteAddr().String())

	ipad := http.Header{"User-Agent": {"Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1"}}
	tablet, _, err := websocket.DefaultDialer.Dial(url, ipad)
	if err != nil {
		t.Fatal(err)
	}
	defer tablet.Close()
	tabletToken := loginAs(t, tablet, "Admin", "secret")["token"].(string)

	send(t, conn, message{"type": "listSessions", "requestId": "q1"})
	sessions := receive(t, conn, byRequestID("q1"))["sessions"].([]interface{})
	if len(sessions) != 2 {
		t.Fatalf("expected 2 sessions, got %v", sessions)
	}
	var tabletID string
	for _, raw := range sessions {
		s := raw.(map[string]interface{})
		if s["device"] == "iPad · Safari" {
			tabletID = s["id"].(string)
			if s["current"] != false {
				t.Fatalf("the tablet is not the current device: %v", s)
			}
		}
	}
	if tabletID == "" {
		t.Fatalf("tablet not listed: %v", sessions)
	}

	send(t, conn, message{"type": "revokeSession", "requestId": "q2", "id": tabletID})
	if m := receive(t, conn, byRequestID("q2")); m["success"] != true {
		t.Fatalf("revokeSession failed: %v", m)
	}
	// The tablet's connection is closed, and its token no longer works
	_ = tablet.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, _, err := tablet.ReadMessage(); err == nil {
		t.Fatal("expected the tablet to be disconnected")
	}
	again, _, err := websocket.DefaultDialer.Dial(url, ipad)
	if err != nil {
		t.Fatal(err)
	}
	defer again.Close()
	send(t, again, message{"type": "auth", "token": tabletToken})
	if m := receive(t, again, func(m message) bool { return m["type"] == "auth_response" }); m["code"] != "LOGIN_REQUIRED" {
		t.Fatalf("expected the revoked token to be refused, got %v", m)
	}

	// Logging out this device revokes its token too
	send(t, conn, message{"type": "listSessions", "requestId": "q3"})
	if n := len(receive(t, conn, byRequestID("q3"))["sessions"].([]interface{})); n != 1 {
		t.Fatalf("expected 1 session left, got %d", n)
	}
	send(t, conn, message{"type": "logout", "requestId": "q4"})
	receive(t, conn, byRequestID("q4"))
	send(t, conn, message{"type": "listSessions", "requestId": "q5"})
	if m := receive(t, conn, byRequestID("q5")); m["sessions"] != nil {
		t.Fatalf("expected no sessions, got %v", m)
	}
}

func TestStackDirectLinks(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	call := func(id string, m message) message {
		m["requestId"] = id
		m["interfaceName"] = "HmIP-RF"
		send(t, conn, m)
		return receive(t, conn, byRequestID(id))
	}

	links := call("q1", message{"type": "getLinks", "address": "00151BE9A1C2D3"})["links"].([]interface{})
	if len(links) != 1 || links[0].(map[string]interface{})["sender"] != "000855699C4F38:1" {
		t.Fatalf("unexpected links: %v", links)
	}

	if m := call("q2", message{"type": "addLink", "sender": "000855699C4F38:2", "receiver": "00151BE9A1C2D3:4", "name": "Esstisch aus"}); m["success"] != true {
		t.Fatalf("addLink failed: %v", m)
	}
	if n := len(call("q3", message{"type": "getLinks", "address": "000855699C4F38"})["links"].([]interface{})); n != 2 {
		t.Fatalf("expected 2 links of the button, got %d", n)
	}

	description := call("q4", message{"type": "getLinkParamsetDescription", "address": "00151BE9A1C2D3:4", "partner": "000855699C4F38:2"})["description"].(map[string]interface{})
	if description["SHORT_ON_LEVEL"] == nil {
		t.Fatalf("unexpected description: %v", description)
	}
	if m := call("q5", message{"type": "putLinkParamset", "address": "00151BE9A1C2D3:4", "partner": "000855699C4F38:2",
		"values": map[string]interface{}{"SHORT_PROFILE_ACTION_TYPE": 1, "SHORT_ON_LEVEL": 0}}); m["success"] != true {
		t.Fatalf("putLinkParamset failed: %v", m)
	}
	values := call("q6", message{"type": "getLinkParamset", "address": "00151BE9A1C2D3:4", "partner": "000855699C4F38:2"})["values"].(map[string]interface{})
	if values["SHORT_ON_LEVEL"] != 0.0 {
		t.Fatalf("link parameter not stored: %v", values)
	}
	if m := call("q7", message{"type": "putLinkParamset", "address": "00151BE9A1C2D3:4", "partner": "000855699C4F38:2",
		"values": map[string]interface{}{"SHORT_ON_LEVEL": 2}}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}

	if m := call("q8", message{"type": "removeLink", "sender": "000855699C4F38:1", "receiver": "00151BE9A1C2D3:4"}); m["success"] != true {
		t.Fatalf("removeLink failed: %v", m)
	}
	if n := len(call("q9", message{"type": "getLinks", "address": "00151BE9A1C2D3:4"})["links"].([]interface{})); n != 1 {
		t.Fatalf("expected 1 link left, got %d", n)
	}
	if ccu.CallCount("HmIP-RF addLink") != 1 || ccu.CallCount("HmIP-RF removeLink") != 1 {
		t.Fatal("link calls missing")
	}
}

func TestProtocolSchemaIsStrict(t *testing.T) {
	schema := serverMessageSchema(t)
	for _, tc := range []struct {
		json  string
		valid bool
	}{
		{`{"type":"rename_response","requestId":"q1","success":true}`, true},
		{`{"type":"rename_response","success":true,"unexpected":1}`, false},
		{`{"deviceId":"d","rooms":[{"id":1,"name":"Küche"}]}`, true},
		{`{"deviceId":"d","rooms":[{"id":"1","name":"Küche"}]}`, false},
		{`{"event":{"interface":"HmIP-RF","channel":"A:1","datapoint":"STATE","value":true,"timestamp":"t"}}`, true},
		{`{"type":"error","error":"x","code":"FORBIDDEN","requestId":"q2"}`, true},
		{`{"type":"something_new","success":true}`, false},
	} {
		instance, err := jsonschema.UnmarshalJSON(strings.NewReader(tc.json))
		if err != nil {
			t.Fatal(err)
		}
		if err := schema.Validate(instance); (err == nil) != tc.valid {
			t.Errorf("%s: valid=%v, got %v", tc.json, tc.valid, err)
		}
	}
}
