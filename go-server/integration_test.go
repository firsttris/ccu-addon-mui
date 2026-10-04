package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
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
		BackupDir:          filepath.Join(t.TempDir(), "backups"),
		PushFile:           filepath.Join(t.TempDir(), "push.json"),
		PushSubject:        "mailto:test@example.com",
		AddonsDir:          addonsDir(t),
	}
	cfg.SyslogConfig, cfg.LogDir = logFiles(t)
	auditLogs[ccu] = cfg.AuditLogFile
	wsPorts[ccu] = cfg.WSPort

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

// wsPorts remembers the WebSocket port of each started stack
var wsPorts = map[*fakeccu.CCU]int{}

// logFiles is a syslog config as the CCU writes it and a log directory with
// two of the files the WebUI's log download puts together
func logFiles(t *testing.T) (string, string) {
	dir := t.TempDir()
	config := filepath.Join(dir, "syslog")
	_ = os.WriteFile(config, []byte("LOGLEVEL_RFD=2\nLOGLEVEL_HS485D=2\nLOGLEVEL_REGA=2\nLOGLEVEL_HMIP=ERROR\n"), 0o644)
	logDir := filepath.Join(dir, "log")
	_ = os.MkdirAll(logDir, 0o755)
	_ = os.WriteFile(filepath.Join(logDir, "messages.0"), []byte("older line\n"), 0o644)
	_ = os.WriteFile(filepath.Join(logDir, "messages"), []byte("newest line\n"), 0o644)
	return config, logDir
}

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
	if len(channels) != 23 {
		t.Fatalf("expected all 23 channels, got %d", len(channels))
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
	if len(types) != 7 || types["0000DBE9A5C1F2"] != "HmIP-RF HmIP-SRH" || types["LEQ0000001"] != "BidCos-RF HM-LC-Sw1-FM" ||
		types["LEQ0000004"] != "BidCos-RF HM-TC-IT-WM-W-EU" {
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
	if len(sysvars) != 7 {
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

func TestStackSystemInfo(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "getSystemInfo", "requestId": "q1"})
	info := receive(t, conn, byRequestID("q1"))
	modules := info["radioInterfaces"].([]interface{})
	if len(modules) != 2 {
		t.Fatalf("expected the radio modules of BidCos-RF and HmIP-RF: %v", info)
	}
	first := modules[0].(map[string]interface{})
	if first["interfaceName"] != "BidCos-RF" || first["dutyCycle"] != 12.0 || first["connected"] != true {
		t.Fatalf("unexpected module: %v", first)
	}

	loginAs(t, conn, "Gast", "gast")
	send(t, conn, message{"type": "getSystemInfo", "requestId": "q2"})
	if m := receive(t, conn, byRequestID("q2")); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", m)
	}
}

func TestStackCreateRenameDeleteRoomsAndSysvars(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	send(t, conn, message{"type": "createGroup", "requestId": "q1", "list": "rooms", "name": "Garage"})
	created := receive(t, conn, byRequestID("q1"))
	id, ok := created["id"].(float64)
	if created["success"] != true || !ok {
		t.Fatalf("createGroup failed: %v", created)
	}
	send(t, conn, message{"type": "renameGroup", "requestId": "q2", "list": "rooms", "id": id, "name": "Carport"})
	if m := receive(t, conn, byRequestID("q2")); m["success"] != true {
		t.Fatalf("renameGroup failed: %v", m)
	}
	send(t, conn, message{"type": "getRooms", "requestId": "q3", "deviceId": "test"})
	if rooms := fmt.Sprint(receive(t, conn, byRequestID("q3"))["rooms"]); !strings.Contains(rooms, "Carport") {
		t.Fatalf("room not renamed: %v", rooms)
	}
	// A room id from the other list is not found
	send(t, conn, message{"type": "deleteGroup", "requestId": "q4", "list": "trades", "id": id})
	if m := receive(t, conn, byRequestID("q4")); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}
	send(t, conn, message{"type": "deleteGroup", "requestId": "q5", "list": "rooms", "id": id})
	if m := receive(t, conn, byRequestID("q5")); m["success"] != true {
		t.Fatalf("deleteGroup failed: %v", m)
	}
	send(t, conn, message{"type": "createGroup", "requestId": "q6", "list": "rooms", "name": `x"); system.Exec("y`})
	if m := receive(t, conn, byRequestID("q6")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected the injection to be refused, got %v", m)
	}

	send(t, conn, message{"type": "createSysvar", "requestId": "q7", "name": "Gäste", "kind": "enum", "valueList": []string{"keine", "Familie", "Freunde"}})
	created = receive(t, conn, byRequestID("q7"))
	svID, ok := created["id"].(float64)
	if created["success"] != true || !ok {
		t.Fatalf("createSysvar failed: %v", created)
	}
	send(t, conn, message{"type": "getSysvars", "requestId": "q8"})
	sysvars := fmt.Sprint(receive(t, conn, byRequestID("q8"))["sysvars"])
	if !strings.Contains(sysvars, "Gäste") || !strings.Contains(sysvars, "Freunde") {
		t.Fatalf("sysvar not created: %v", sysvars)
	}
	send(t, conn, message{"type": "renameSysvar", "requestId": "q9", "id": svID, "name": "Besuch"})
	if m := receive(t, conn, byRequestID("q9")); m["success"] != true {
		t.Fatalf("renameSysvar failed: %v", m)
	}
	send(t, conn, message{"type": "deleteSysvar", "requestId": "q10", "id": svID})
	if m := receive(t, conn, byRequestID("q10")); m["success"] != true {
		t.Fatalf("deleteSysvar failed: %v", m)
	}
	send(t, conn, message{"type": "createSysvar", "requestId": "q11", "name": "Leer", "kind": "enum"})
	if m := receive(t, conn, byRequestID("q11")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected an enum without values to be refused, got %v", m)
	}

	// Guests may not
	loginAs(t, conn, "Gast", "gast")
	send(t, conn, message{"type": "createGroup", "requestId": "q12", "list": "trades", "name": "Garten"})
	if m := receive(t, conn, byRequestID("q12")); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", m)
	}
}

func TestStackServiceMessages(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	send(t, conn, message{"type": "getServiceMessages", "requestId": "q1"})
	messages := receive(t, conn, byRequestID("q1"))["messages"].([]interface{})
	types := map[string]float64{}
	for _, raw := range messages {
		m := raw.(map[string]interface{})
		types[m["type"].(string)] = m["id"].(float64)
	}
	if len(messages) != 3 || types["UNREACH"] == 0 || types["LOW_BAT"] == 0 || types["STICKY_UNREACH"] == 0 {
		t.Fatalf("unexpected service messages: %v", messages)
	}

	// Guests may look, not acknowledge
	loginAs(t, conn, "Gast", "gast")
	send(t, conn, message{"type": "acknowledgeServiceMessage", "requestId": "q2", "id": types["STICKY_UNREACH"]})
	if m := receive(t, conn, byRequestID("q2")); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", m)
	}

	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "acknowledgeServiceMessage", "requestId": "q3", "id": types["STICKY_UNREACH"]})
	if m := receive(t, conn, byRequestID("q3")); m["success"] != true {
		t.Fatalf("acknowledge failed: %v", m)
	}
	send(t, conn, message{"type": "getServiceMessages", "requestId": "q4"})
	if messages := receive(t, conn, byRequestID("q4"))["messages"].([]interface{}); len(messages) != 2 {
		t.Fatalf("sticky message not acknowledged: %v", messages)
	}
	send(t, conn, message{"type": "acknowledgeServiceMessage", "requestId": "q5", "id": 1})
	if m := receive(t, conn, byRequestID("q5")); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}
}

func TestStackFirmwareUpdate(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	device := func(requestID string) map[string]interface{} {
		send(t, conn, message{"type": "listDevices", "requestId": requestID})
		for _, raw := range receive(t, conn, byRequestID(requestID))["devices"].([]interface{}) {
			if d := raw.(map[string]interface{}); d["address"] == "0008DA8A9F1234" {
				return d
			}
		}
		t.Fatal("window contact not listed")
		return nil
	}
	if d := device("q1"); d["firmware"] != "1.0.12" || d["availableFirmware"] != "1.2.6" || d["firmwareUpdateState"] != "READY_FOR_UPDATE" {
		t.Fatalf("unexpected firmware state: %v", d)
	}
	send(t, conn, message{"type": "installFirmware", "requestId": "q2", "interfaceName": "HmIP-RF", "address": "0008DA8A9F1234"})
	if m := receive(t, conn, byRequestID("q2")); m["success"] != true {
		t.Fatalf("installFirmware failed: %v", m)
	}
	if d := device("q3"); d["firmware"] != "1.2.6" || d["availableFirmware"] != nil || d["firmwareUpdateState"] != "UP_TO_DATE" {
		t.Fatalf("firmware not updated: %v", d)
	}
	// Not ready: the CCU refuses
	send(t, conn, message{"type": "installFirmware", "requestId": "q4", "interfaceName": "HmIP-RF", "address": "0008DA8A9F1234"})
	if m := receive(t, conn, byRequestID("q4")); m["code"] != "CCU_ERROR" {
		t.Fatalf("expected CCU_ERROR, got %v", m)
	}
}

func TestStackBackup(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	// The WebUI needs the password for its session
	send(t, conn, message{"type": "createBackup", "requestId": "b1", "password": "wrong"})
	if m := receive(t, conn, byRequestID("b1")); m["code"] != "INVALID_CREDENTIALS" {
		t.Fatalf("expected INVALID_CREDENTIALS, got %v", m)
	}

	send(t, conn, message{"type": "createBackup", "requestId": "b2", "password": "secret"})
	m := receive(t, conn, byRequestID("b2"))
	if m["success"] != true || m["fileName"] != "ccu3-webui-2026-10-03.sbk" || m["size"] != float64(len(fakeccu.FakeBackup)) {
		t.Fatalf("unexpected backup response: %v", m)
	}

	download := func() *http.Response {
		resp, err := http.Get("http://" + conn.RemoteAddr().String() + m["url"].(string))
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { resp.Body.Close() })
		return resp
	}
	resp := download()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK || string(body) != fakeccu.FakeBackup {
		t.Fatalf("download failed: %d %q", resp.StatusCode, body)
	}
	if cd := resp.Header.Get("Content-Disposition"); cd != "attachment; filename=ccu3-webui-2026-10-03.sbk" {
		t.Fatalf("unexpected Content-Disposition %q", cd)
	}
	// Only once
	if resp := download(); resp.StatusCode != http.StatusNotFound {
		t.Fatalf("second download: status %d", resp.StatusCode)
	}

	data, _ := os.ReadFile(auditLogs[ccu])
	if !strings.Contains(string(data), `"action":"createBackup"`) {
		t.Fatalf("backup not in the audit log: %s", data)
	}
}

func TestStackBackupNeedsAdmin(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Gast", "gast")
	send(t, conn, message{"type": "createBackup", "requestId": "b1", "password": "gast"})
	if m := receive(t, conn, byRequestID("b1")); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", m)
	}
}

func TestStackAlarmMessages(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	alarms := func(requestID string) []interface{} {
		send(t, conn, message{"type": "getAlarmMessages", "requestId": requestID})
		return receive(t, conn, byRequestID(requestID))["alarms"].([]interface{})
	}
	list := alarms("a1")
	if len(list) != 1 {
		t.Fatalf("expected the water alarm, got %v", list)
	}
	alarm := list[0].(map[string]interface{})
	if alarm["name"] != "Wasseralarm" || alarm["active"] != true || alarm["message"] != "Wasser erkannt" || alarm["counter"] != 1.0 {
		t.Fatalf("unexpected alarm: %v", alarm)
	}

	send(t, conn, message{"type": "acknowledgeAlarmMessage", "requestId": "a2", "id": alarm["id"]})
	if m := receive(t, conn, byRequestID("a2")); m["success"] != true {
		t.Fatalf("acknowledge failed: %v", m)
	}
	if list := alarms("a3"); len(list) != 0 {
		t.Fatalf("alarm still listed: %v", list)
	}

	// Triggered again: back in the list, counted twice
	send(t, conn, message{"type": "setSysvar", "requestId": "a4", "id": alarm["id"], "value": true})
	receive(t, conn, byRequestID("a4"))
	if list := alarms("a5"); len(list) != 1 || list[0].(map[string]interface{})["counter"] != 2.0 {
		t.Fatalf("expected the alarm again, got %v", list)
	}
}

func TestStackFavorites(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	favorites := func(requestID string) []interface{} {
		send(t, conn, message{"type": "getFavorites", "requestId": requestID})
		return receive(t, conn, byRequestID(requestID))["favorites"].([]interface{})
	}
	change := func(requestID string, m message) message {
		m["requestId"] = requestID
		send(t, conn, m)
		return receive(t, conn, byRequestID(requestID))
	}
	list := favorites("f1")
	if len(list) != 2 {
		t.Fatalf("expected both lists of Admin, got %v", list)
	}
	evening := list[0].(map[string]interface{})
	if evening["name"] != "Abends" || len(evening["items"].([]interface{})) != 6 {
		t.Fatalf("unexpected list: %v", evening)
	}

	// Its channels, without the system variable and the program
	send(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "favoriteId": "1300", "requestId": "f2"})
	if channels := receive(t, conn, byRequestID("f2"))["channels"].([]interface{}); len(channels) != 4 {
		t.Fatalf("expected 4 channels, got %d", len(channels))
	}

	created := change("f3", message{"type": "createFavorite", "name": "Morgens"})
	if created["success"] != true {
		t.Fatalf("create failed: %v", created)
	}
	id := created["id"]
	for i, m := range []message{
		{"type": "addFavoriteItem", "id": id, "itemId": 9104},
		{"type": "addFavoriteItem", "id": id, "itemId": 950},
		{"type": "renameFavorite", "id": id, "name": "Früh"},
		{"type": "removeFavoriteItem", "id": id, "itemId": 950},
	} {
		if r := change(fmt.Sprintf("f4-%d", i), m); r["success"] != true {
			t.Fatalf("%v failed: %v", m, r)
		}
	}
	if r := change("f5", message{"type": "addFavoriteItem", "id": id, "itemId": 424242}); r["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND for an unknown item, got %v", r)
	}
	list = favorites("f6")
	morning := list[2].(map[string]interface{})
	if morning["name"] != "Früh" || len(morning["items"].([]interface{})) != 1 {
		t.Fatalf("unexpected new list: %v", morning)
	}
	if r := change("f7", message{"type": "deleteFavorite", "id": id}); r["success"] != true {
		t.Fatalf("delete failed: %v", r)
	}
	if list := favorites("f8"); len(list) != 2 {
		t.Fatalf("list not deleted: %v", list)
	}

	// The guest sees only its own list and changes nothing
	loginAs(t, conn, "Gast", "gast")
	if list := favorites("g1"); len(list) != 1 || list[0].(map[string]interface{})["name"] != "Gäste" {
		t.Fatalf("unexpected lists of the guest: %v", list)
	}
	if r := change("g2", message{"type": "createFavorite", "name": "Meins"}); r["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", r)
	}
}

func TestStackChannelTile(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "elevate", "password": "secret", "requestId": "e"})
	receive(t, conn, byRequestID("e"))

	send(t, conn, message{"type": "setChannelTile", "requestId": "t1", "id": 101, "tile": "switch"})
	if m := receive(t, conn, byRequestID("t1")); m["success"] != true {
		t.Fatalf("setChannelTile failed: %v", m)
	}
	send(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "roomId": "1", "requestId": "t2"})
	for _, raw := range receive(t, conn, byRequestID("t2"))["channels"].([]interface{}) {
		if ch := raw.(map[string]interface{}); ch["id"] == 101.0 && ch["tile"] != "switch" {
			t.Fatalf("tile not stored: %v", ch)
		}
	}
	send(t, conn, message{"type": "setChannelTile", "requestId": "t3", "id": 101, "tile": "lamp"})
	if m := receive(t, conn, byRequestID("t3")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
}

func TestStackProgramEditor(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "elevate", "password": "secret", "requestId": "e"})
	receive(t, conn, byRequestID("e"))

	read := func(requestID string, id interface{}) map[string]interface{} {
		send(t, conn, message{"type": "getProgram", "requestId": requestID, "id": id})
		m := receive(t, conn, byRequestID(requestID))
		program, _ := m["program"].(map[string]interface{})
		return program
	}
	program := read("p1", 1201)
	if program["name"] != "Rollläden abends schließen" || len(program["rules"].([]interface{})) != 1 {
		t.Fatalf("unexpected program: %v", program)
	}

	// A new one: WENN window open, DANN a script after 30 s, SONST the light off
	created := message{
		"id": 0, "name": "Fenster offen", "description": "Test", "active": true,
		"rules": []message{{
			"groupOperator": "or", "breakOnRestart": true,
			"groups": [][]message{{{
				"leftType": "ivtObjectId", "leftValue": 0, "channel": 102, "datapoint": "STATE", "compare": 1, "trigger": 4,
				"value1Type": "ivtInteger", "value1": "1", "value2Type": "ivtEmpty", "value2": "0",
			}}},
			"destinations": []message{{
				"param": "ivtString", "channel": 0, "datapointId": 0, "valueType": "ivtString", "value": "WriteLine(\"zu\");", "delay": 30,
			}},
		}},
		"else": message{"breakOnRestart": false, "destinations": []message{{
			"param": "ivtObjectId", "channel": 101, "datapointId": 0, "datapoint": "STATE", "valueType": "ivtBinary", "value": "false", "delay": 0,
		}}},
	}
	send(t, conn, message{"type": "saveProgram", "requestId": "p2", "program": created})
	saved := receive(t, conn, byRequestID("p2"))
	if saved["success"] != true || saved["id"] == nil {
		t.Fatalf("saveProgram failed: %v", saved)
	}
	back := read("p3", saved["id"])
	rule := back["rules"].([]interface{})[0].(map[string]interface{})
	dest := rule["destinations"].([]interface{})[0].(map[string]interface{})
	cond := rule["groups"].([]interface{})[0].([]interface{})[0].(map[string]interface{})
	if back["name"] != "Fenster offen" || dest["delay"] != 30.0 || dest["value"] != "WriteLine(\"zu\");" || cond["datapoint"] != "STATE" || back["else"] == nil {
		t.Fatalf("program not stored as sent: %v", back)
	}

	// Refused: a script that could end its string
	created["rules"].([]message)[0]["destinations"].([]message)[0]["value"] = "x^; system.Exec(^rm"
	send(t, conn, message{"type": "saveProgram", "requestId": "p4", "program": created})
	if m := receive(t, conn, byRequestID("p4")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}

	send(t, conn, message{"type": "deleteProgram", "requestId": "p5", "id": saved["id"]})
	if m := receive(t, conn, byRequestID("p5")); m["success"] != true {
		t.Fatalf("deleteProgram failed: %v", m)
	}
	send(t, conn, message{"type": "getProgram", "requestId": "p6", "id": saved["id"]})
	if m := receive(t, conn, byRequestID("p6")); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}
}

func TestStackAllLinks(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "getAllLinks", "requestId": "l1"})
	links := receive(t, conn, byRequestID("l1"))["links"].([]interface{})
	if len(links) != 1 {
		t.Fatalf("expected the fixture's link, got %v", links)
	}
	link := links[0].(map[string]interface{})
	if link["interfaceName"] != "HmIP-RF" || link["sender"] != "000855699C4F38:1" || link["name"] != "Esstisch an" {
		t.Fatalf("unexpected link: %v", link)
	}
	loginAs(t, conn, "Gast", "gast")
	send(t, conn, message{"type": "getAllLinks", "requestId": "l2"})
	if m := receive(t, conn, byRequestID("l2")); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", m)
	}
}

func TestStackLayout(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	layout := `{"v":1,"layouts":{"lg":[{"i":"c:LEQ0000001:1","x":0,"y":0,"w":2}]}}`
	send(t, conn, message{"type": "setLayout", "requestId": "y1", "id": 1, "layout": layout})
	if m := receive(t, conn, byRequestID("y1")); m["success"] != true {
		t.Fatalf("setLayout failed: %v", m)
	}
	send(t, conn, message{"type": "getLayout", "requestId": "y2", "id": 1})
	if m := receive(t, conn, byRequestID("y2")); m["layout"] != layout {
		t.Fatalf("layout not stored: %v", m)
	}
	send(t, conn, message{"type": "setLayout", "requestId": "y3", "id": 1, "layout": `{"x":"^"}`})
	if m := receive(t, conn, byRequestID("y3")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
	send(t, conn, message{"type": "getLayout", "requestId": "y4", "id": 424242})
	if m := receive(t, conn, byRequestID("y4")); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}
}

func TestStackPushSubscription(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Gast", "gast")
	endpoint := "https://push.example.com/send/abc"
	send(t, conn, message{"type": "getPush", "requestId": "p1", "endpoint": endpoint})
	status := receive(t, conn, byRequestID("p1"))
	if key, _ := status["publicKey"].(string); len(key) < 80 || status["subscribed"] != false {
		t.Fatalf("unexpected status: %v", status)
	}
	sub := message{"endpoint": endpoint, "keys": message{"p256dh": "BPKa", "auth": "c2VjcmV0"}}
	send(t, conn, message{"type": "subscribePush", "requestId": "p2", "subscription": sub, "alarms": true, "service": false, "language": "en", "device": "Handy"})
	if m := receive(t, conn, byRequestID("p2")); m["success"] != true {
		t.Fatalf("subscribePush failed: %v", m)
	}
	send(t, conn, message{"type": "getPush", "requestId": "p3", "endpoint": endpoint})
	if m := receive(t, conn, byRequestID("p3")); m["subscribed"] != true || m["alarms"] != true || m["service"] != false {
		t.Fatalf("not subscribed: %v", m)
	}
	// Only https push services
	sub["endpoint"] = "http://127.0.0.1/evil"
	send(t, conn, message{"type": "subscribePush", "requestId": "p4", "subscription": sub, "alarms": true})
	if m := receive(t, conn, byRequestID("p4")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
	send(t, conn, message{"type": "unsubscribePush", "requestId": "p5", "endpoint": endpoint})
	receive(t, conn, byRequestID("p5"))
	send(t, conn, message{"type": "getPush", "requestId": "p6", "endpoint": endpoint})
	if m := receive(t, conn, byRequestID("p6")); m["subscribed"] != false {
		t.Fatalf("still subscribed: %v", m)
	}
}

func TestStackSystemSettings(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "elevate", "password": "secret", "requestId": "e"})
	receive(t, conn, byRequestID("e"))

	send(t, conn, message{"type": "getSystemSettings", "requestId": "s1"})
	settings := receive(t, conn, byRequestID("s1"))
	if settings["latitude"] != 52.52 || settings["timeZoneOffset"] != 60.0 || settings["time"] == "" || settings["canPower"] != false {
		t.Fatalf("unexpected settings: %v", settings)
	}
	send(t, conn, message{"type": "setLocation", "requestId": "s2", "latitude": 48.137154, "longitude": 11.576124})
	if m := receive(t, conn, byRequestID("s2")); m["success"] != true {
		t.Fatalf("setLocation failed: %v", m)
	}
	send(t, conn, message{"type": "getSystemSettings", "requestId": "s3"})
	if m := receive(t, conn, byRequestID("s3")); m["latitude"] != 48.137154 || m["longitude"] != 11.576124 {
		t.Fatalf("location not stored: %v", m)
	}
	send(t, conn, message{"type": "setLocation", "requestId": "s4", "latitude": 91, "longitude": 0})
	if m := receive(t, conn, byRequestID("s4")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
	// Not on a CCU: no reboot
	send(t, conn, message{"type": "powerAction", "requestId": "s5", "action": "reboot"})
	if m := receive(t, conn, byRequestID("s5")); m["code"] != "NOT_SUPPORTED" {
		t.Fatalf("expected NOT_SUPPORTED, got %v", m)
	}
}

func TestStackUsers(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "elevate", "password": "secret", "requestId": "e"})
	receive(t, conn, byRequestID("e"))

	list := func(id string) []interface{} {
		send(t, conn, message{"type": "getUsers", "requestId": id})
		return receive(t, conn, byRequestID(id))["users"].([]interface{})
	}
	before := len(list("u0"))

	send(t, conn, message{"type": "saveUser", "requestId": "u1", "id": 0, "fullName": "Anna Muster", "level": "user", "password": "geheim!1", "showLogin": true})
	created := receive(t, conn, byRequestID("u1"))
	if created["success"] != true || created["id"] == nil {
		t.Fatalf("saveUser failed: %v", created)
	}
	users := list("u2")
	anna := users[len(users)-1].(map[string]interface{})
	if len(users) != before+1 || anna["name"] != "AnnaMuster" || anna["firstName"] != "Anna" || anna["lastName"] != "Muster" || anna["level"] != "user" || anna["hasPassword"] != true {
		t.Fatalf("user not created as sent: %v", anna)
	}
	// The new user can log in with the password
	other, _, err := websocket.DefaultDialer.Dial(fmt.Sprintf("ws://%s/", conn.RemoteAddr().String()), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	loginAs(t, other, "AnnaMuster", "geheim!1")

	// Same name again
	send(t, conn, message{"type": "saveUser", "requestId": "u3", "id": 0, "fullName": "AnnaMuster", "level": "guest"})
	if m := receive(t, conn, byRequestID("u3")); m["code"] != "EXISTS" {
		t.Fatalf("expected EXISTS, got %v", m)
	}
	// Unsafe password
	send(t, conn, message{"type": "saveUser", "requestId": "u4", "id": created["id"], "fullName": "Anna Muster", "level": "user", "password": "x^y"})
	if m := receive(t, conn, byRequestID("u4")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
	// The own account keeps its rights
	var adminID interface{}
	for _, u := range users {
		if u.(map[string]interface{})["name"] == "Admin" {
			adminID = u.(map[string]interface{})["id"]
		}
	}
	send(t, conn, message{"type": "saveUser", "requestId": "u5", "id": adminID, "fullName": "Admin", "level": "guest"})
	if m := receive(t, conn, byRequestID("u5")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
	send(t, conn, message{"type": "deleteUser", "requestId": "u6", "id": adminID})
	if m := receive(t, conn, byRequestID("u6")); m["success"] == true {
		t.Fatalf("deleted the own account: %v", m)
	}

	send(t, conn, message{"type": "deleteUser", "requestId": "u7", "id": created["id"]})
	if m := receive(t, conn, byRequestID("u7")); m["success"] != true {
		t.Fatalf("deleteUser failed: %v", m)
	}
	if len(list("u8")) != before {
		t.Fatal("user not deleted")
	}
}

func TestStackChannelOptions(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "elevate", "password": "secret", "requestId": "e"})
	receive(t, conn, byRequestID("e"))

	// A user (not admin) who may operate in general
	send(t, conn, message{"type": "saveUser", "requestId": "u", "id": 0, "fullName": "Kind", "level": "user", "password": "kind"})
	receive(t, conn, byRequestID("u"))
	child, _, err := websocket.DefaultDialer.Dial(fmt.Sprintf("ws://%s/", conn.RemoteAddr().String()), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer child.Close()
	loginAs(t, child, "Kind", "kind")
	set := func(c *websocket.Conn, id string) message {
		send(t, c, message{"type": "setDatapoint", "requestId": id, "interfaceName": "BidCos-RF", "address": "LEQ0000001:1", "attribute": "STATE", "value": true})
		return receive(t, c, byRequestID(id))
	}
	if m := set(child, "s1"); m["success"] != true {
		t.Fatalf("user could not operate: %v", m)
	}

	send(t, conn, message{"type": "setChannelOption", "requestId": "o1", "id": 101, "option": "usable", "value": false})
	if m := receive(t, conn, byRequestID("o1")); m["success"] != true {
		t.Fatalf("setChannelOption failed: %v", m)
	}
	if m := set(child, "s2"); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN for a read-only channel, got %v", m)
	}
	if m := set(conn, "s3"); m["success"] != true {
		t.Fatalf("admin could not operate: %v", m)
	}

	send(t, conn, message{"type": "setChannelOption", "requestId": "o2", "id": 101, "option": "visible", "value": false})
	receive(t, conn, byRequestID("o2"))
	send(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "requestId": "c", "all": true})
	for _, ch := range receive(t, conn, byRequestID("c"))["channels"].([]interface{}) {
		if c := ch.(map[string]interface{}); c["id"] == 101.0 && (c["hidden"] != true || c["readOnly"] != true) {
			t.Fatalf("options not listed: %v", c)
		}
	}
	send(t, conn, message{"type": "setChannelOption", "requestId": "o4", "id": 101, "option": "aes", "value": true})
	if m := receive(t, conn, byRequestID("o4")); m["success"] != true {
		t.Fatalf("setting AES failed: %v", m)
	}
	send(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "requestId": "c2", "all": true})
	for _, ch := range receive(t, conn, byRequestID("c2"))["channels"].([]interface{}) {
		if c := ch.(map[string]interface{}); c["id"] == 101.0 && c["aes"] != true {
			t.Fatalf("AES not listed: %v", c)
		}
	}
	send(t, conn, message{"type": "setChannelOption", "requestId": "o3", "id": 101, "option": "sticky", "value": true})
	if m := receive(t, conn, byRequestID("o3")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
}

func TestStackHistory(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "elevate", "password": "secret", "requestId": "e"})
	receive(t, conn, byRequestID("e"))

	send(t, conn, message{"type": "setChannelOption", "requestId": "o", "id": 101, "option": "logged", "value": true})
	receive(t, conn, byRequestID("o"))
	send(t, conn, message{"type": "getHistory", "requestId": "h1", "start": 0, "count": 50})
	history := receive(t, conn, byRequestID("h1"))
	entries := history["entries"].([]interface{})
	if history["total"] != 1.0 || len(entries) != 1 {
		t.Fatalf("unexpected history: %v", history)
	}
	if e := entries[0].(map[string]interface{}); e["name"] != "Wohnzimmer Licht" || e["datapoint"] != "STATE" || e["kind"] != "channel" {
		t.Fatalf("unexpected entry: %v", e)
	}
	send(t, conn, message{"type": "setChannelOption", "requestId": "o2", "id": 401, "option": "logged", "value": true})
	receive(t, conn, byRequestID("o2"))
	send(t, conn, message{"type": "getHistory", "requestId": "hc", "start": 0, "count": 500, "channel": 401})
	byChannel := receive(t, conn, byRequestID("hc"))["entries"].([]interface{})
	if len(byChannel) != 48 {
		t.Fatalf("expected 24 temperature and 24 humidity entries, got %d", len(byChannel))
	}
	for _, e := range byChannel {
		if e.(map[string]interface{})["name"] != "Wohnzimmer Thermostat" {
			t.Fatalf("entry of another channel: %v", e)
		}
	}
	send(t, conn, message{"type": "getHistory", "requestId": "h2", "start": 0, "count": 501})
	if m := receive(t, conn, byRequestID("h2")); m["code"] != "INVALID_REQUEST" {
		t.Fatalf("expected INVALID_REQUEST, got %v", m)
	}
	send(t, conn, message{"type": "clearHistory", "requestId": "h3"})
	if m := receive(t, conn, byRequestID("h3")); m["success"] != true {
		t.Fatalf("clearHistory failed: %v", m)
	}
	send(t, conn, message{"type": "getHistory", "requestId": "h4"})
	if m := receive(t, conn, byRequestID("h4")); m["total"] != 0.0 {
		t.Fatalf("history not cleared: %v", m)
	}
}

// addonsDir is an rc.d directory with one add-on, which logs the operations
// it runs to ops.log next to it
func addonsDir(t *testing.T) string {
	dir := filepath.Join(t.TempDir(), "rc.d")
	_ = os.MkdirAll(dir, 0o755)
	script := "#!/bin/sh\ncase \"$1\" in\ninfo) echo \"Name: CUxD\"; echo \"Version: 2.11\"; echo \"Operations: restart uninstall\"; echo \"Config-Url: /addons/cuxd/\";;\nrestart|uninstall) echo \"$1\" >> " + filepath.Join(dir, "..", "ops.log") + ";;\nesac\n"
	_ = os.WriteFile(filepath.Join(dir, "cuxd"), []byte(script), 0o755)
	return dir
}

func TestStackAddons(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "elevate", "password": "secret", "requestId": "e"})
	receive(t, conn, byRequestID("e"))

	send(t, conn, message{"type": "getAddons", "requestId": "a1", "language": "de"})
	list := receive(t, conn, byRequestID("a1"))["addons"].([]interface{})
	if len(list) != 1 {
		t.Fatalf("unexpected add-ons: %v", list)
	}
	if a := list[0].(map[string]interface{}); a["name"] != "CUxD" || a["version"] != "2.11" || a["configUrl"] != "/addons/cuxd/" {
		t.Fatalf("unexpected add-on: %v", a)
	}
	send(t, conn, message{"type": "addonAction", "requestId": "a2", "id": "cuxd", "operation": "restart"})
	if m := receive(t, conn, byRequestID("a2")); m["success"] != true {
		t.Fatalf("restart failed: %v", m)
	}
	send(t, conn, message{"type": "addonAction", "requestId": "a3", "id": "../../bin/sh", "operation": "restart"})
	if m := receive(t, conn, byRequestID("a3")); m["success"] == true {
		t.Fatalf("ran a path: %v", m)
	}
	send(t, conn, message{"type": "addonAction", "requestId": "a4", "id": "cuxd", "operation": "uninstall"})
	if m := receive(t, conn, byRequestID("a4")); m["success"] != true {
		t.Fatalf("uninstall failed: %v", m)
	}
	send(t, conn, message{"type": "getAddons", "requestId": "a5"})
	if list := receive(t, conn, byRequestID("a5"))["addons"].([]interface{}); len(list) != 0 {
		t.Fatalf("add-on still listed: %v", list)
	}
}

func TestStackChangePassword(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "elevate", "password": "secret", "requestId": "e"})
	receive(t, conn, byRequestID("e"))
	send(t, conn, message{"type": "saveUser", "requestId": "u2", "id": 0, "fullName": "Kind", "level": "user", "password": "alt1"})
	receive(t, conn, byRequestID("u2"))

	child, _, err := websocket.DefaultDialer.Dial(fmt.Sprintf("ws://%s/", conn.RemoteAddr().String()), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer child.Close()
	loginAs(t, child, "Kind", "alt1")
	send(t, child, message{"type": "changePassword", "requestId": "p1", "currentPassword": "falsch", "newPassword": "neu2"})
	if m := receive(t, child, byRequestID("p1")); m["code"] != "INVALID_CREDENTIALS" {
		t.Fatalf("expected INVALID_CREDENTIALS, got %v", m)
	}
	send(t, child, message{"type": "changePassword", "requestId": "p2", "currentPassword": "alt1", "newPassword": "x^y"})
	if m := receive(t, child, byRequestID("p2")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
	send(t, child, message{"type": "changePassword", "requestId": "p3", "currentPassword": "alt1", "newPassword": "neu2"})
	if m := receive(t, child, byRequestID("p3")); m["success"] != true {
		t.Fatalf("changePassword failed: %v", m)
	}

	// The new password works, the old one no longer
	again, _, err := websocket.DefaultDialer.Dial(fmt.Sprintf("ws://%s/", conn.RemoteAddr().String()), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer again.Close()
	if m := loginAs(t, again, "Kind", "alt1"); m["success"] == true {
		t.Fatalf("old password still works: %v", m)
	}
	if m := loginAs(t, again, "Kind", "neu2"); m["success"] != true {
		t.Fatalf("new password does not work: %v", m)
	}

	// Guests may not
	guest, _, _ := websocket.DefaultDialer.Dial(fmt.Sprintf("ws://%s/", conn.RemoteAddr().String()), nil)
	defer guest.Close()
	loginAs(t, guest, "Gast", "gast")
	send(t, guest, message{"type": "changePassword", "requestId": "p4", "currentPassword": "gast", "newPassword": "neu"})
	if m := receive(t, guest, byRequestID("p4")); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", m)
	}
}

func TestStackDevicePrograms(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Gast", "gast")
	send(t, conn, message{"type": "getDevicePrograms", "requestId": "d1", "address": "LEQ0000002"})
	programs := receive(t, conn, byRequestID("d1"))["programs"].([]interface{})
	if len(programs) != 1 {
		t.Fatalf("unexpected programs: %v", programs)
	}
	if p := programs[0].(map[string]interface{}); p["id"] != 1201.0 || p["channels"].([]interface{})[0] != "LEQ0000002:1" {
		t.Fatalf("unexpected program: %v", p)
	}
	send(t, conn, message{"type": "getDevicePrograms", "requestId": "d2", "address": "x\"; system.Exec(\""})
	if m := receive(t, conn, byRequestID("d2")); m["code"] != "INVALID_REQUEST" {
		t.Fatalf("expected INVALID_REQUEST, got %v", m)
	}
}

func TestStackVirtualKeys(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "getVirtualKeys", "requestId": "k1"})
	keys := receive(t, conn, byRequestID("k1"))["keys"].([]interface{})
	if len(keys) != 3 || keys[0].(map[string]interface{})["name"] != "Alles aus" {
		t.Fatalf("unexpected keys: %v", keys)
	}
	// Not among all devices
	send(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "requestId": "c", "all": true})
	for _, ch := range receive(t, conn, byRequestID("c"))["channels"].([]interface{}) {
		if c := ch.(map[string]interface{}); strings.HasPrefix(c["address"].(string), "BidCoS-RF:") {
			t.Fatalf("virtual key listed among all channels: %v", c)
		}
	}
	send(t, conn, message{"type": "setDatapoint", "requestId": "p", "interfaceName": "BidCos-RF", "address": "BidCoS-RF:1", "attribute": "PRESS_SHORT", "value": true})
	if m := receive(t, conn, byRequestID("p")); m["success"] != true {
		t.Fatalf("pressing the virtual key failed: %v", m)
	}
	_ = ccu
}

func TestStackReplaceDevice(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	ccu.AddInboxDevice("BidCos-RF", "LEQ0000099", "HM-LC-Sw1-FM")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "elevate", "password": "secret", "requestId": "e"})
	receive(t, conn, byRequestID("e"))

	send(t, conn, message{"type": "listReplaceableDevices", "requestId": "r1", "interfaceName": "BidCos-RF", "address": "LEQ0000099"})
	devices := receive(t, conn, byRequestID("r1"))["devices"].([]interface{})
	if len(devices) != 1 || devices[0].(map[string]interface{})["address"] != "LEQ0000001" {
		t.Fatalf("unexpected replaceable devices: %v", devices)
	}
	send(t, conn, message{"type": "listReplaceableDevices", "requestId": "r2", "interfaceName": "HmIP-RF", "address": "0008DA8A9F1234"})
	if m := receive(t, conn, byRequestID("r2")); m["code"] != "NOT_SUPPORTED" {
		t.Fatalf("expected NOT_SUPPORTED for HmIP, got %v", m)
	}
	send(t, conn, message{"type": "replaceDevice", "requestId": "r3", "interfaceName": "BidCos-RF", "address": "LEQ0000099", "oldAddress": "LEQ0000001"})
	if m := receive(t, conn, byRequestID("r3")); m["success"] != true {
		t.Fatalf("replaceDevice failed: %v", m)
	}
	// The living room light now has the new address, in its rooms as before
	send(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "roomId": "1", "requestId": "c"})
	found := false
	for _, ch := range receive(t, conn, byRequestID("c"))["channels"].([]interface{}) {
		if c := ch.(map[string]interface{}); c["address"] == "LEQ0000099:1" && c["name"] == "Wohnzimmer Licht" {
			found = true
		}
	}
	if !found {
		t.Fatal("the new device did not take the old one's place")
	}
	send(t, conn, message{"type": "getInbox", "requestId": "i"})
	for _, d := range receive(t, conn, byRequestID("i"))["devices"].([]interface{}) {
		if d.(map[string]interface{})["address"] == "LEQ0000099" {
			t.Fatal("the new device is still in the inbox")
		}
	}
}

func TestStackComTest(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "startComTest", "requestId": "t1", "address": "LEQ0000001"})
	started := receive(t, conn, byRequestID("t1"))["started"].(string)
	if len(started) != 19 {
		t.Fatalf("unexpected start time %q", started)
	}
	send(t, conn, message{"type": "pollComTest", "requestId": "t2", "address": "LEQ0000001", "started": started})
	if m := receive(t, conn, byRequestID("t2")); m["answered"] != started {
		t.Fatalf("reachable device did not answer: %v", m)
	}
	send(t, conn, message{"type": "pollComTest", "requestId": "t3", "address": "LEQ0000001", "started": "now; x"})
	if m := receive(t, conn, byRequestID("t3")); m["code"] != "INVALID_REQUEST" {
		t.Fatalf("expected INVALID_REQUEST, got %v", m)
	}
	send(t, conn, message{"type": "startComTest", "requestId": "t4", "address": "NOPE000000"})
	if m := receive(t, conn, byRequestID("t4")); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}
}

func TestStackLogging(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	send(t, conn, message{"type": "getLogging", "requestId": "l1"})
	if m := receive(t, conn, byRequestID("l1")); m["rfd"] != 2.0 || m["rega"] != 2.0 || m["hmip"] != "ERROR" || m["host"] != "" {
		t.Fatalf("unexpected logging settings: %v", m)
	}
	send(t, conn, message{"type": "setLogging", "requestId": "l3", "host": "10.0.0.5", "rfd": 1, "hmip": "INFO", "rega": 0})
	if m := receive(t, conn, byRequestID("l3")); m["success"] != true {
		t.Fatalf("setLogging failed: %v", m)
	}
	send(t, conn, message{"type": "getLogging", "requestId": "l4"})
	if m := receive(t, conn, byRequestID("l4")); m["rfd"] != 1.0 || m["rega"] != 0.0 || m["hmip"] != "INFO" || m["host"] != "10.0.0.5" {
		t.Fatalf("settings not saved: %v", m)
	}
	if ccu.CallCount("BidCos-RF logLevel") < 2 {
		t.Fatal("the rfd log level was not set")
	}
	send(t, conn, message{"type": "setLogging", "requestId": "l5", "host": "a b", "rfd": 3, "hmip": "INFO", "rega": 0})
	if m := receive(t, conn, byRequestID("l5")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}

	send(t, conn, message{"type": "downloadLogs", "requestId": "d"})
	download := receive(t, conn, byRequestID("d"))
	url := fmt.Sprintf("http://127.0.0.1:%d%s", wsPorts[ccu], download["url"])
	resp, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if text := string(body); !strings.Contains(text, "***** messages.0 *****") || strings.Index(text, "older line") > strings.Index(text, "newest line") {
		t.Fatalf("unexpected log download: %q", text)
	}
	if resp, err := http.Get(url); err != nil || resp.StatusCode != http.StatusNotFound {
		t.Fatal("a download link must work only once")
	}
}

func TestStackRunScript(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	send(t, conn, message{"type": "runScript", "requestId": "s1", "script": "WriteLine(\"Hallo\");\nWrite(\"a^b\");"})
	if m := receive(t, conn, byRequestID("s1")); m["output"] != "Hallo\na^b" || m["syntaxError"] != nil {
		t.Fatalf("unexpected answer: %v", m)
	}
	send(t, conn, message{"type": "runScript", "requestId": "s2", "script": "Write(\"x\"); dom.Kaputt("})
	if m := receive(t, conn, byRequestID("s2")); m["syntaxError"] == nil || m["output"] != "" {
		t.Fatalf("expected a syntax error, got %v", m)
	}
	send(t, conn, message{"type": "runScript", "requestId": "s3", "script": ""})
	if m := receive(t, conn, byRequestID("s3")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
	if data, _ := os.ReadFile(auditLogs[ccu]); !strings.Contains(string(data), "runScript") {
		t.Fatal("tested scripts must be audit logged")
	}
}

func TestStackLogicOptions(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	program := func(id string) map[string]interface{} {
		send(t, conn, message{"type": "getPrograms", "requestId": id})
		for _, p := range receive(t, conn, byRequestID(id))["programs"].([]interface{}) {
			if p := p.(map[string]interface{}); p["id"] == 1200.0 {
				return p
			}
		}
		t.Fatal("program 1200 missing")
		return nil
	}
	if p := program("p0"); p["operate"] != true || p["visible"] != true {
		t.Fatalf("unexpected program: %v", p)
	}
	send(t, conn, message{"type": "setLogicOption", "requestId": "o1", "id": 1200, "option": "operate", "value": false})
	if m := receive(t, conn, byRequestID("o1")); m["success"] != true {
		t.Fatalf("setLogicOption failed: %v", m)
	}
	send(t, conn, message{"type": "setLogicOption", "requestId": "o2", "id": 1200, "option": "visible", "value": false})
	receive(t, conn, byRequestID("o2"))
	if p := program("p1"); p["operate"] != false || p["visible"] != false {
		t.Fatalf("options not saved: %v", p)
	}

	// A user may no longer run it, an administrator still may
	send(t, conn, message{"type": "saveUser", "requestId": "u", "id": 0, "fullName": "Anna Muster", "level": "user", "password": "geheim!1"})
	receive(t, conn, byRequestID("u"))
	other, _, err := websocket.DefaultDialer.Dial(fmt.Sprintf("ws://%s/", conn.RemoteAddr().String()), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	loginAs(t, other, "AnnaMuster", "geheim!1")
	send(t, other, message{"type": "runProgram", "requestId": "r1", "id": 1200})
	if m := receive(t, other, byRequestID("r1")); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", m)
	}
	send(t, other, message{"type": "runProgram", "requestId": "r2", "id": 1201})
	if m := receive(t, other, byRequestID("r2")); m["success"] != true {
		t.Fatalf("an operable program must run: %v", m)
	}
	send(t, conn, message{"type": "runProgram", "requestId": "r3", "id": 1200})
	if m := receive(t, conn, byRequestID("r3")); m["success"] != true {
		t.Fatalf("administrators may run any program: %v", m)
	}

	// System variables: visible only
	send(t, conn, message{"type": "setLogicOption", "requestId": "o3", "id": 950, "option": "visible", "value": false})
	receive(t, conn, byRequestID("o3"))
	send(t, conn, message{"type": "getSysvars", "requestId": "s"})
	for _, sv := range receive(t, conn, byRequestID("s"))["sysvars"].([]interface{}) {
		if sv := sv.(map[string]interface{}); sv["id"] == 950.0 && sv["visible"] != false {
			t.Fatalf("sysvar still visible: %v", sv)
		}
	}
	send(t, conn, message{"type": "setLogicOption", "requestId": "o4", "id": 950, "option": "operate", "value": false})
	if m := receive(t, conn, byRequestID("o4")); m["code"] != "NOT_FOUND" {
		t.Fatalf("operate is for programs only, got %v", m)
	}
	send(t, conn, message{"type": "setLogicOption", "requestId": "o5", "id": 950, "option": "visible", "value": "yes"})
	if m := receive(t, conn, byRequestID("o5")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
}
