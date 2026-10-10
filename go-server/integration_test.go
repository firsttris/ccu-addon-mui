//go:build !lite

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

// Ports handed out in this run: the listener is closed again at once, so
// the kernel may offer the same port to the next call, and two servers of
// one stack would then fight over it (address already in use)
var usedPorts sync.Map

func freePort(t *testing.T) int {
	t.Helper()
	for {
		l, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		port := l.Addr().(*net.TCPAddr).Port
		l.Close()
		if _, taken := usedPorts.LoadOrStore(port, true); !taken {
			return port
		}
	}
}

// startServer runs the server with free ports and connects to it. A port
// freePort found free may be taken again before the server listens on it
// (the kernel hands it to an outgoing connection): the server then stops
// at once (address already in use) and is started again with new ports.
func startServer(t *testing.T, cfg *config.Config) *websocket.Conn {
	t.Helper()
	// Whatever else took the port may accept and never answer
	dialer := websocket.Dialer{HandshakeTimeout: 2 * time.Second}
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		cfg.WSPort, cfg.RPCServerPort = freePort(t), freePort(t)
		ctx, cancel := context.WithCancel(context.Background())
		done := make(chan struct{})
		go func() {
			defer close(done)
			if err := run(ctx, cfg); err != nil {
				t.Error(err)
			}
		}()
		url := fmt.Sprintf("ws://127.0.0.1:%d/", cfg.WSPort)
	dial:
		for i := 0; i < 50; i++ {
			var conn *websocket.Conn
			if conn, _, err = dialer.Dial(url, nil); err == nil {
				t.Cleanup(func() {
					cancel()
					<-done
				})
				return conn
			}
			select {
			case <-done:
				break dial // stopped: try new ports
			case <-time.After(50 * time.Millisecond):
			}
		}
		cancel()
		<-done
	}
	t.Fatalf("server did not start: %v", err)
	return nil
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
		WSBindHost:         "127.0.0.1",
		RPCPort:            ccu.InterfacePorts["BidCos-RF"],
		HmIPPort:           ccu.InterfacePorts["HmIP-RF"],
		VirtualDevicesPort: ccu.InterfacePorts["VirtualDevices"],
		WiredPort:          ccu.InterfacePorts["BidCos-Wired"],
		CCUHost:            "127.0.0.1",
		CallbackHost:       "127.0.0.1",
		RegaPort:           ccu.RegaPort,
		SysvarInterval:     50 * time.Millisecond,
		AuthMode:           authMode,
		WebUIURL:           fmt.Sprintf("http://127.0.0.1:%d", ccu.WebUIPort),
		AuthKeyFile:        filepath.Join(t.TempDir(), "key"),
		AuditLogFile:       filepath.Join(t.TempDir(), "audit.log"),
		SessionsFile:       filepath.Join(t.TempDir(), "sessions.json"),
		BackupDir:          filepath.Join(t.TempDir(), "backups"),
		PushFile:           filepath.Join(t.TempDir(), "push.json"),
		RulesFile:          filepath.Join(t.TempDir(), "rules.json"),
		TilesFile:          filepath.Join(t.TempDir(), "tiles.json"),
		WWWDir:             "../fixtures/www",
		PushSubject:        "mailto:test@example.com",
		AddonsDir:          addonsDir(t),
	}
	cfg.SyslogConfig, cfg.LogDir = logFiles(t)
	cfg.TimeConfFile, cfg.NTPClientFile, cfg.TZFile = clockFiles(t)
	// A copy the fake HMServer may change
	cfg.GroupsFile = filepath.Join(t.TempDir(), "groups.gson")
	if data, err := os.ReadFile("../fixtures/groups.gson"); err == nil {
		_ = os.WriteFile(cfg.GroupsFile, data, 0o644)
	}
	ccu.GroupsFile = cfg.GroupsFile
	cfg.DiagramsFile = filepath.Join(t.TempDir(), "diagrams.json")
	cfg.DiagramsDir = filepath.Join(t.TempDir(), "diagrams")
	cfg.ConfigDir = t.TempDir()
	ccu.ConfigDir = cfg.ConfigDir
	// The fake also stands in for eQ-3's update server
	cfg.DeviceFirmwareServer = cfg.WebUIURL
	cfg.StatusDir = "../fixtures/status"
	for _, name := range []string{"netconfig", "firewall.conf", "rfd.conf"} {
		if data, err := os.ReadFile("../fixtures/" + name); err == nil {
			_ = os.WriteFile(filepath.Join(cfg.ConfigDir, name), data, 0o644)
		}
	}
	auditLogs[ccu] = cfg.AuditLogFile

	conn := startServer(t, cfg)
	wsPorts[ccu] = cfg.WSPort
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

// clockFiles are time.conf and ntpclient as the CCU writes them, and where
// TZ goes
func clockFiles(t *testing.T) (string, string, string) {
	dir := t.TempDir()
	timeConf := filepath.Join(dir, "time.conf")
	_ = os.WriteFile(timeConf, []byte("COUNTRY=Deutschland\nCITY='Berlin'\nLATITUDE=52.52\nLONGITUDE=13.405\nTIMEZONE=CET/CEST\n"), 0o644)
	ntp := filepath.Join(dir, "ntpclient")
	_ = os.WriteFile(ntp, []byte("NTPSERVERS='pool.ntp.org'\n"), 0o644)
	return timeConf, ntp, filepath.Join(dir, "TZ")
}

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

type message map[string]any

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
	rooms := receive(t, conn, byRequestID("q1"))["rooms"].([]any)
	if len(rooms) != 3 || rooms[1].(map[string]any)["name"] != "Küche" {
		t.Fatalf("unexpected rooms: %v", rooms)
	}

	send(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "roomId": "1", "requestId": "q2"})
	channels := receive(t, conn, byRequestID("q2"))["channels"].([]any)
	light := channels[0].(map[string]any)
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
	event := messages[1]["event"].(map[string]any)
	if event["channel"] != "LEQ0000001:1" || event["datapoint"] != "STATE" || event["value"] != true {
		t.Fatalf("unexpected event: %v", event)
	}

	// A change on the device itself
	if err := ccu.SetValue("BidCos-RF", "LEQ0000001:1", "STATE", false); err != nil {
		t.Fatal(err)
	}
	event = receive(t, conn, func(m message) bool { return m["event"] != nil })["event"].(map[string]any)
	if event["value"] != false {
		t.Fatalf("unexpected event: %v", event)
	}

	// Paramset descriptions over XML-RPC
	send(t, conn, message{"type": "getParamsetDescription", "requestId": "q3", "interfaceName": "HmIP-RF", "address": "0000DBE9A5C1F2:1", "paramsetKey": "VALUES"})
	description := receive(t, conn, byRequestID("q3"))["description"].(map[string]any)
	state := description["STATE"].(map[string]any)
	if state["type"] != "ENUM" || len(state["valueList"].([]any)) != 3 {
		t.Fatalf("unexpected description: %v", description)
	}

	send(t, conn, message{"type": "getDeviceProblems", "requestId": "q4"})
	problems := receive(t, conn, byRequestID("q4"))["devices"].([]any)
	if len(problems) != 2 {
		t.Fatalf("unexpected device problems: %v", problems)
	}
}

// As the WebUI (setDpState): a command also goes to a device marked
// unreachable, UNREACH of HmIP battery devices is often stale
func TestStackSendsToUnreachableDevice(t *testing.T) {
	ccu, conn := startStack(t, "none")
	send(t, conn, message{"type": "auth"})
	receive(t, conn, func(m message) bool { return m["type"] == "auth_response" })

	if err := ccu.SetValue("BidCos-RF", "LEQ0000001:0", "UNREACH", true); err != nil {
		t.Fatal(err)
	}
	send(t, conn, message{"type": "setDatapoint", "requestId": "1", "interfaceName": "BidCos-RF", "address": "LEQ0000001:1", "attribute": "STATE", "value": true})
	m := receive(t, conn, func(m message) bool { return m["type"] == "setDatapoint_response" })
	if m["success"] != true {
		t.Fatalf("expected the command to be sent, got %v", m)
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
	if len(channels) != 24 {
		t.Fatalf("expected all 24 channels, got %d", len(channels))
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
	var entries []map[string]any
	for _, line := range lines {
		var e map[string]any
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

// Saving an input's operation mode stores it as metadata "channelMode" in
// the interface process and in ReGa, as the WebUI does (webui.js
// SetParameters, hmipChannelConfigDialogs.tcl), so getChannels reports it
func TestStackInputChannelMode(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	modeOf := func(id string) any {
		send(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "all": true, "requestId": id})
		raw, _ := json.Marshal(receive(t, conn, byRequestID(id))["channels"])
		var channels []map[string]any
		_ = json.Unmarshal(raw, &channels)
		for _, ch := range channels {
			if ch["address"] == "0019A0C9B3E2D1:1" {
				return ch["mode"]
			}
		}
		t.Fatalf("input channel missing")
		return nil
	}
	if mode := modeOf("q1"); mode != 3.0 {
		t.Fatalf("expected mode 3 from the fixture, got %v", mode)
	}

	send(t, conn, message{"type": "putParamset", "requestId": "q2", "interfaceName": "HmIP-RF",
		"address": "0019A0C9B3E2D1:1", "paramsetKey": "MASTER", "values": map[string]any{"CHANNEL_OPERATION_MODE": 1}})
	if m := receive(t, conn, byRequestID("q2")); m["success"] != true {
		t.Fatalf("putParamset failed: %v", m)
	}
	if v := ccu.Metadata("HmIP-RF", "0019A0C9B3E2D1:1", "channelMode"); fmt.Sprint(v) != "1" {
		t.Fatalf("setMetadata not called: %v", v)
	}
	if mode := modeOf("q3"); mode != 1.0 {
		t.Fatalf("expected mode 1 after saving, got %v", mode)
	}

	// Other channels get no channel mode
	send(t, conn, message{"type": "putParamset", "requestId": "q4", "interfaceName": "HmIP-RF",
		"address": "0000DBE9A5C1F2:1", "paramsetKey": "MASTER", "values": map[string]any{"EVENT_DELAY_UNIT": 1}})
	receive(t, conn, byRequestID("q4"))
	if ccu.CallCount("HmIP-RF setMetadata") != 1 {
		t.Fatalf("expected one setMetadata, got %d", ccu.CallCount("HmIP-RF setMetadata"))
	}
}

func TestStackChangeDeviceSettings(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	put := func(id string, values map[string]any) message {
		send(t, conn, message{"type": "putParamset", "requestId": id, "interfaceName": "HmIP-RF",
			"address": "0000DBE9A5C1F2:1", "paramsetKey": "MASTER", "values": values})
		return receive(t, conn, byRequestID(id))
	}

	if m := put("q1", map[string]any{"EVENT_DELAY_UNIT": 2}); m["success"] != true {
		t.Fatalf("putParamset failed: %v", m)
	}
	send(t, conn, message{"type": "getParamset", "requestId": "q2", "interfaceName": "HmIP-RF", "address": "0000DBE9A5C1F2:1", "paramsetKey": "MASTER"})
	values := receive(t, conn, byRequestID("q2"))["values"].(map[string]any)
	if values["EVENT_DELAY_UNIT"] != 2.0 {
		t.Fatalf("value not stored: %v", values)
	}

	// Outside the value list: refused before it reaches the CCU
	if m := put("q3", map[string]any{"EVENT_DELAY_UNIT": 7}); m["code"] != "INVALID_VALUE" {
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
	devices := receive(t, conn, byRequestID("q1"))["devices"].([]any)
	types := map[string]string{}
	for _, raw := range devices {
		d := raw.(map[string]any)
		types[d["address"].(string)] = d["interfaceName"].(string) + " " + d["type"].(string)
	}
	if len(types) != 8 || types["0000DBE9A5C1F2"] != "HmIP-RF HmIP-SRH" || types["LEQ0000001"] != "BidCos-RF HM-LC-Sw1-FM" ||
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
			"address": "0000DBE9A5C1F2:1", "paramsetKey": "MASTER", "values": map[string]any{"EVENT_DELAY_UNIT": 1}})
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
	if until, _ := elevate["elevatedUntil"].(string); until == "" {
		t.Fatalf("expected when the admin rights end: %v", elevate)
	}

	// Locked again before the admin token expires: the device stays logged
	// in, its other connection is closed and the admin token is useless
	send(t, again, message{"type": "endElevation", "requestId": "q5"})
	if m := receive(t, again, byRequestID("q5")); m["success"] != true {
		t.Fatalf("endElevation failed: %v", m)
	}
	if m := put(again, "q6"); m["code"] != "ELEVATION_REQUIRED" {
		t.Fatalf("expected ELEVATION_REQUIRED after endElevation, got %v", m)
	}
	_ = tablet.SetReadDeadline(time.Now().Add(5 * time.Second))
	for {
		if _, _, err := tablet.ReadMessage(); err != nil {
			break
		}
	}
	third, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer third.Close()
	send(t, third, message{"type": "auth", "token": token, "adminToken": elevate["adminToken"]})
	if m := receive(t, third, func(m message) bool { return m["type"] == "auth_response" }); m["success"] != true || m["elevated"] != false {
		t.Fatalf("expected logged in without admin rights: %v", m)
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
	channels := receive(t, conn, byRequestID("q6"))["channels"].([]any)
	var light map[string]any
	for _, raw := range channels {
		if ch := raw.(map[string]any); ch["address"] == "LEQ0000001:1" {
			light = ch
		}
	}
	if light == nil || light["name"] != "Deckenlicht" || fmt.Sprint(light["rooms"]) != "[2]" {
		t.Fatalf("unexpected channel in the kitchen: %v", light)
	}

	send(t, conn, message{"type": "listDevices", "requestId": "q7"})
	for _, raw := range receive(t, conn, byRequestID("q7"))["devices"].([]any) {
		if d := raw.(map[string]any); d["address"] == "0000DBE9A5C1F2" && d["name"] != "Griff" {
			t.Fatalf("device not renamed: %v", d)
		}
	}

	data, _ := os.ReadFile(auditLogs[ccu])
	if !strings.Contains(string(data), `"action":"rename","target":"LEQ0000001:1","previous":"Wohnzimmer Licht","value":"Deckenlicht"`) {
		t.Fatalf("rename not audited: %s", data)
	}
}

// BidCos-Wired (hs485d) is connected when a Wired gateway is set up: the
// server registers for its events and searches the bus for new devices,
// as the WebUI's cp_add_device.cgi (action_wir_search)
func TestStackWired(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	send(t, conn, message{"type": "getInterfaces", "requestId": "q1"})
	interfaces := fmt.Sprint(receive(t, conn, byRequestID("q1"))["interfaces"])
	if !strings.Contains(interfaces, "BidCos-Wired") {
		t.Fatalf("Wired not connected: %s", interfaces)
	}
	deadline := time.Now().Add(3 * time.Second)
	for ccu.CallCount("BidCos-Wired init") == 0 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if ccu.CallCount("BidCos-Wired init") == 0 {
		t.Fatal("no init on BidCos-Wired")
	}

	send(t, conn, message{"type": "searchWiredDevices", "requestId": "q2"})
	if m := receive(t, conn, byRequestID("q2")); m["success"] != true {
		t.Fatalf("searchWiredDevices failed: %v", m)
	}
	send(t, conn, message{"type": "getInbox", "requestId": "q3"})
	inbox := fmt.Sprint(receive(t, conn, byRequestID("q3"))["devices"])
	if !strings.Contains(inbox, "HMW-LC-Sw2-DR") {
		t.Fatalf("found device not in the inbox: %s", inbox)
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
	inbox := receive(t, conn, byRequestID("q3"))["devices"].([]any)
	if len(inbox) != 1 || inbox[0].(map[string]any)["type"] != "HmIP-SWDO" {
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
	for _, raw := range receive(t, conn, byRequestID("q7"))["devices"].([]any) {
		if raw.(map[string]any)["address"] == "0008DA8A9F1234" {
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

// System variables send no events: the server reads them for the
// connections that loaded them and sends them when they change
func TestStackSysvarChangesArePushed(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	send(t, conn, message{"type": "getSysvars", "requestId": "q1"})
	receive(t, conn, byRequestID("q1"))

	// A program changes the outside temperature
	if !ccu.SetSysvar(951, 21.5) {
		t.Fatal("sysvar 951 missing")
	}
	m := receive(t, conn, func(m message) bool {
		if m["type"] != "sysvars" {
			return false
		}
		for _, raw := range m["sysvars"].([]any) {
			if sv := raw.(map[string]any); sv["id"] == 951.0 && sv["value"] == 21.5 {
				return true
			}
		}
		return false
	})
	if len(m["sysvars"].([]any)) != 7 {
		t.Fatalf("expected the whole list, got %v", m["sysvars"])
	}
}

func TestStackSysvarsAndPrograms(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	send(t, conn, message{"type": "getSysvars", "requestId": "q1"})
	sysvars := receive(t, conn, byRequestID("q1"))["sysvars"].([]any)
	if len(sysvars) != 7 {
		t.Fatalf("unexpected sysvars: %v", sysvars)
	}
	mode := sysvars[2].(map[string]any)
	if mode["kind"] != "enum" || mode["value"] != 1.0 || len(mode["valueList"].([]any)) != 3 {
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
	if v := receive(t, conn, byRequestID("q4"))["sysvars"].([]any)[2].(map[string]any)["value"]; v != 2.0 {
		t.Fatalf("sysvar not set: %v", v)
	}

	send(t, conn, message{"type": "getPrograms", "requestId": "q5"})
	programs := receive(t, conn, byRequestID("q5"))["programs"].([]any)
	if len(programs) != 4 || programs[3].(map[string]any)["internal"] != true || programs[0].(map[string]any)["internal"] != nil {
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
	sessions := receive(t, conn, byRequestID("q1"))["sessions"].([]any)
	if len(sessions) != 2 {
		t.Fatalf("expected 2 sessions, got %v", sessions)
	}
	var tabletID string
	for _, raw := range sessions {
		s := raw.(map[string]any)
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
	if n := len(receive(t, conn, byRequestID("q3"))["sessions"].([]any)); n != 1 {
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

	links := call("q1", message{"type": "getLinks", "address": "00151BE9A1C2D3"})["links"].([]any)
	if len(links) != 1 || links[0].(map[string]any)["sender"] != "000855699C4F38:1" {
		t.Fatalf("unexpected links: %v", links)
	}

	if m := call("q2", message{"type": "addLink", "sender": "000855699C4F38:2", "receiver": "00151BE9A1C2D3:4", "name": "Esstisch aus"}); m["success"] != true {
		t.Fatalf("addLink failed: %v", m)
	}
	if n := len(call("q3", message{"type": "getLinks", "address": "000855699C4F38"})["links"].([]any)); n != 2 {
		t.Fatalf("expected 2 links of the button, got %d", n)
	}

	description := call("q4", message{"type": "getLinkParamsetDescription", "address": "00151BE9A1C2D3:4", "partner": "000855699C4F38:2"})["description"].(map[string]any)
	if description["SHORT_ON_LEVEL"] == nil {
		t.Fatalf("unexpected description: %v", description)
	}
	if m := call("q5", message{"type": "putLinkParamset", "address": "00151BE9A1C2D3:4", "partner": "000855699C4F38:2",
		"values": map[string]any{"SHORT_PROFILE_ACTION_TYPE": 1, "SHORT_ON_LEVEL": 0}}); m["success"] != true {
		t.Fatalf("putLinkParamset failed: %v", m)
	}
	values := call("q6", message{"type": "getLinkParamset", "address": "00151BE9A1C2D3:4", "partner": "000855699C4F38:2"})["values"].(map[string]any)
	if values["SHORT_ON_LEVEL"] != 0.0 {
		t.Fatalf("link parameter not stored: %v", values)
	}
	if m := call("q7", message{"type": "putLinkParamset", "address": "00151BE9A1C2D3:4", "partner": "000855699C4F38:2",
		"values": map[string]any{"SHORT_ON_LEVEL": 2}}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}

	if m := call("q8", message{"type": "removeLink", "sender": "000855699C4F38:1", "receiver": "00151BE9A1C2D3:4"}); m["success"] != true {
		t.Fatalf("removeLink failed: %v", m)
	}
	if n := len(call("q9", message{"type": "getLinks", "address": "00151BE9A1C2D3:4"})["links"].([]any)); n != 1 {
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
	modules := info["radioInterfaces"].([]any)
	// The built-in modules and the LAN gateway of rfd.conf
	if len(modules) != 3 {
		t.Fatalf("expected the radio modules of BidCos-RF and HmIP-RF: %v", info)
	}
	first := modules[0].(map[string]any)
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
	messages := receive(t, conn, byRequestID("q1"))["messages"].([]any)
	types := map[string]float64{}
	for _, raw := range messages {
		m := raw.(map[string]any)
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
	if messages := receive(t, conn, byRequestID("q4"))["messages"].([]any); len(messages) != 2 {
		t.Fatalf("sticky message not acknowledged: %v", messages)
	}
	send(t, conn, message{"type": "acknowledgeServiceMessage", "requestId": "q5", "id": 1})
	if m := receive(t, conn, byRequestID("q5")); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}
}

func TestStackServiceMessagesFollowEvents(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	send(t, conn, message{"type": "getServiceMessages", "requestId": "q1"})
	if messages := receive(t, conn, byRequestID("q1"))["messages"].([]any); len(messages) != 3 {
		t.Fatalf("unexpected service messages: %v", messages)
	}
	// The battery runs low: the server reads the messages again after the
	// event and sends them, the app doesn't ask
	if err := ccu.SetValue("HmIP-RF", "0000DBE9A5C1F2:0", "LOW_BAT", true); err != nil {
		t.Fatal(err)
	}
	pushed := receive(t, conn, func(m message) bool { return m["type"] == "serviceMessages" })
	if messages := pushed["messages"].([]any); len(messages) != 4 {
		t.Fatalf("expected the new message, got %v", messages)
	}
}

func TestStackFirmwareUpdate(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	device := func(requestID string) map[string]any {
		send(t, conn, message{"type": "listDevices", "requestId": requestID})
		for _, raw := range receive(t, conn, byRequestID(requestID))["devices"].([]any) {
			if d := raw.(map[string]any); d["address"] == "0008DA8A9F1234" {
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

	// BidCos: updateFirmware transfers and installs in one go
	send(t, conn, message{"type": "installFirmware", "requestId": "q5", "interfaceName": "BidCos-RF", "address": "LEQ0000001"})
	if m := receive(t, conn, byRequestID("q5")); m["success"] != true {
		t.Fatalf("updateFirmware failed: %v", m)
	}
	// While a BidCos update runs (rfd answers only when it is done), the
	// connection goes on and a second start for the device is refused
	// Long enough that listDevices is answered first also on a busy CI
	// runner (with -race); receive drops what doesn't match, so the
	// update's answer is looked for on the way
	ccu.FirmwareUpdateDelay = 2 * time.Second
	ccu.SetDeviceField("BidCos-RF", "LEQ0000001", "AVAILABLE_FIRMWARE", "2.12")
	send(t, conn, message{"type": "installFirmware", "requestId": "r1", "interfaceName": "BidCos-RF", "address": "LEQ0000001"})
	send(t, conn, message{"type": "installFirmware", "requestId": "r2", "interfaceName": "BidCos-RF", "address": "LEQ0000001"})
	if m := receive(t, conn, byRequestID("r2")); m["code"] != "UPDATE_RUNNING" {
		t.Fatalf("expected UPDATE_RUNNING, got %v", m)
	}
	send(t, conn, message{"type": "listDevices", "requestId": "r3"})
	if m := receive(t, conn, func(m message) bool { return m["requestId"] == "r3" || m["requestId"] == "r1" }); m["requestId"] != "r3" {
		t.Fatalf("listDevices waited for the firmware update: %v", m)
	}
	if m := receive(t, conn, byRequestID("r1")); m["success"] != true {
		t.Fatalf("updateFirmware failed: %v", m)
	}
	ccu.FirmwareUpdateDelay = 0
	// A sleeping device has to be woken with its key
	send(t, conn, message{"type": "installFirmware", "requestId": "q6", "interfaceName": "BidCos-RF", "address": "LEQ0000004"})
	if m := receive(t, conn, byRequestID("q6")); m["code"] != "DEVICE_UNREACHABLE" {
		t.Fatalf("expected DEVICE_UNREACHABLE, got %v", m)
	}
	send(t, conn, message{"type": "listDevices", "requestId": "q7"})
	for _, raw := range receive(t, conn, byRequestID("q7"))["devices"].([]any) {
		d := raw.(map[string]any)
		if d["address"] == "LEQ0000001" && (d["firmware"] != "2.12" || d["availableFirmware"] != nil) {
			t.Fatalf("BidCos firmware not updated: %v", d)
		}
		if d["address"] == "LEQ0000004" && d["availableFirmware"] != "1.5" {
			t.Fatalf("unexpected BidCos firmware: %v", d)
		}
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

	alarms := func(requestID string) []any {
		send(t, conn, message{"type": "getAlarmMessages", "requestId": requestID})
		return receive(t, conn, byRequestID(requestID))["alarms"].([]any)
	}
	list := alarms("a1")
	if len(list) != 1 {
		t.Fatalf("expected the water alarm, got %v", list)
	}
	alarm := list[0].(map[string]any)
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
	if list := alarms("a5"); len(list) != 1 || list[0].(map[string]any)["counter"] != 2.0 {
		t.Fatalf("expected the alarm again, got %v", list)
	}
}

func TestStackFavorites(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	favorites := func(requestID string) []any {
		send(t, conn, message{"type": "getFavorites", "requestId": requestID})
		return receive(t, conn, byRequestID(requestID))["favorites"].([]any)
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
	evening := list[0].(map[string]any)
	if evening["name"] != "Abends" || len(evening["items"].([]any)) != 6 {
		t.Fatalf("unexpected list: %v", evening)
	}

	// Its channels, without the system variable and the program
	send(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "favoriteId": "1300", "requestId": "f2"})
	if channels := receive(t, conn, byRequestID("f2"))["channels"].([]any); len(channels) != 4 {
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
	morning := list[2].(map[string]any)
	if morning["name"] != "Früh" || len(morning["items"].([]any)) != 1 {
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
	if list := favorites("g1"); len(list) != 1 || list[0].(map[string]any)["name"] != "Gäste" {
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
	// Every channel list carries it, from mui-tiles.json
	send(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "all": true, "requestId": "t2"})
	found := false
	for _, raw := range receive(t, conn, byRequestID("t2"))["channels"].([]any) {
		if ch := raw.(map[string]any); ch["id"] == 101.0 {
			found = true
			if ch["tile"] != "switch" {
				t.Fatalf("tile not stored: %v", ch)
			}
		} else if ch["tile"] != nil {
			t.Fatalf("tile on another channel: %v", ch)
		}
	}
	if !found {
		t.Fatal("channel 101 not listed")
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

	read := func(requestID string, id any) map[string]any {
		send(t, conn, message{"type": "getProgram", "requestId": requestID, "id": id})
		m := receive(t, conn, byRequestID(requestID))
		program, _ := m["program"].(map[string]any)
		return program
	}
	program := read("p1", 1201)
	if program["name"] != "Rollläden abends schließen" || len(program["rules"].([]any)) != 1 {
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
	rule := back["rules"].([]any)[0].(map[string]any)
	dest := rule["destinations"].([]any)[0].(map[string]any)
	cond := rule["groups"].([]any)[0].([]any)[0].(map[string]any)
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
	links := receive(t, conn, byRequestID("l1"))["links"].([]any)
	if len(links) != 1 {
		t.Fatalf("expected the fixture's link, got %v", links)
	}
	link := links[0].(map[string]any)
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
	send(t, conn, message{"type": "setLayout", "requestId": "y3", "id": 1, "layout": `[1, 2]`})
	if m := receive(t, conn, byRequestID("y3")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
	// Only for rooms, trades and favorite lists
	send(t, conn, message{"type": "setLayout", "requestId": "y4", "id": 424242, "layout": layout})
	if m := receive(t, conn, byRequestID("y4")); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}
	send(t, conn, message{"type": "getLayout", "requestId": "y5", "id": 424242})
	if m := receive(t, conn, byRequestID("y5")); m["layout"] != "" {
		t.Fatalf("expected no layout, got %v", m)
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

	list := func(id string) []any {
		send(t, conn, message{"type": "getUsers", "requestId": id})
		return receive(t, conn, byRequestID(id))["users"].([]any)
	}
	before := len(list("u0"))

	send(t, conn, message{"type": "saveUser", "requestId": "u1", "id": 0, "fullName": "Anna Muster", "level": "user", "password": "geheim!1", "showLogin": true})
	created := receive(t, conn, byRequestID("u1"))
	if created["success"] != true || created["id"] == nil {
		t.Fatalf("saveUser failed: %v", created)
	}
	users := list("u2")
	anna := users[len(users)-1].(map[string]any)
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
	var adminID any
	for _, u := range users {
		if u.(map[string]any)["name"] == "Admin" {
			adminID = u.(map[string]any)["id"]
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
	for _, ch := range receive(t, conn, byRequestID("c"))["channels"].([]any) {
		if c := ch.(map[string]any); c["id"] == 101.0 && (c["hidden"] != true || c["readOnly"] != true) {
			t.Fatalf("options not listed: %v", c)
		}
	}
	send(t, conn, message{"type": "setChannelOption", "requestId": "o4", "id": 101, "option": "aes", "value": true})
	if m := receive(t, conn, byRequestID("o4")); m["success"] != true {
		t.Fatalf("setting AES failed: %v", m)
	}
	send(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "requestId": "c2", "all": true})
	for _, ch := range receive(t, conn, byRequestID("c2"))["channels"].([]any) {
		if c := ch.(map[string]any); c["id"] == 101.0 && c["aes"] != true {
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
	entries := history["entries"].([]any)
	if history["total"] != 1.0 || len(entries) != 1 {
		t.Fatalf("unexpected history: %v", history)
	}
	if e := entries[0].(map[string]any); e["name"] != "Wohnzimmer Licht" || e["datapoint"] != "STATE" || e["kind"] != "channel" {
		t.Fatalf("unexpected entry: %v", e)
	}
	send(t, conn, message{"type": "setChannelOption", "requestId": "o2", "id": 401, "option": "logged", "value": true})
	receive(t, conn, byRequestID("o2"))
	send(t, conn, message{"type": "getHistory", "requestId": "hc", "start": 0, "count": 500, "channel": 401})
	byChannel := receive(t, conn, byRequestID("hc"))["entries"].([]any)
	if len(byChannel) != 48 {
		t.Fatalf("expected 24 temperature and 24 humidity entries, got %d", len(byChannel))
	}
	for _, e := range byChannel {
		if e.(map[string]any)["name"] != "Wohnzimmer Thermostat" {
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
	list := receive(t, conn, byRequestID("a1"))["addons"].([]any)
	if len(list) != 1 {
		t.Fatalf("unexpected add-ons: %v", list)
	}
	if a := list[0].(map[string]any); a["name"] != "CUxD" || a["version"] != "2.11" || a["configUrl"] != "/addons/cuxd/" {
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
	if list := receive(t, conn, byRequestID("a5"))["addons"].([]any); len(list) != 0 {
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
	programs := receive(t, conn, byRequestID("d1"))["programs"].([]any)
	if len(programs) != 1 {
		t.Fatalf("unexpected programs: %v", programs)
	}
	if p := programs[0].(map[string]any); p["id"] != 1201.0 || p["channels"].([]any)[0] != "LEQ0000002:1" {
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
	keys := receive(t, conn, byRequestID("k1"))["keys"].([]any)
	if len(keys) != 3 || keys[0].(map[string]any)["name"] != "Alles aus" {
		t.Fatalf("unexpected keys: %v", keys)
	}
	// Not among all devices
	send(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "requestId": "c", "all": true})
	for _, ch := range receive(t, conn, byRequestID("c"))["channels"].([]any) {
		if c := ch.(map[string]any); strings.HasPrefix(c["address"].(string), "BidCoS-RF:") {
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
	devices := receive(t, conn, byRequestID("r1"))["devices"].([]any)
	if len(devices) != 1 || devices[0].(map[string]any)["address"] != "LEQ0000001" {
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
	for _, ch := range receive(t, conn, byRequestID("c"))["channels"].([]any) {
		if c := ch.(map[string]any); c["address"] == "LEQ0000099:1" && c["name"] == "Wohnzimmer Licht" {
			found = true
		}
	}
	if !found {
		t.Fatal("the new device did not take the old one's place")
	}
	send(t, conn, message{"type": "getInbox", "requestId": "i"})
	for _, d := range receive(t, conn, byRequestID("i"))["devices"].([]any) {
		if d.(map[string]any)["address"] == "LEQ0000099" {
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

	program := func(id string) map[string]any {
		send(t, conn, message{"type": "getPrograms", "requestId": id})
		for _, p := range receive(t, conn, byRequestID(id))["programs"].([]any) {
			if p := p.(map[string]any); p["id"] == 1200.0 {
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
	for _, sv := range receive(t, conn, byRequestID("s"))["sysvars"].([]any) {
		if sv := sv.(map[string]any); sv["id"] == 950.0 && sv["visible"] != false {
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

func TestStackEditSysvar(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	sysvar := func(id float64) map[string]any {
		send(t, conn, message{"type": "getSysvars", "requestId": "g"})
		for _, sv := range receive(t, conn, byRequestID("g"))["sysvars"].([]any) {
			if sv := sv.(map[string]any); sv["id"] == id {
				return sv
			}
		}
		t.Fatalf("sysvar %v missing", id)
		return nil
	}
	edit := func(id string, m message) message {
		m["type"], m["requestId"] = "editSysvar", id
		send(t, conn, m)
		return receive(t, conn, byRequestID(id))
	}

	// A number: the value is clamped to the new range
	if m := edit("e1", message{"id": 951, "kind": "number", "unit": "K", "min": 0, "max": 10, "description": "Fühler\tNord\nim Garten"}); m["success"] != true {
		t.Fatalf("editSysvar failed: %v", m)
	}
	if sv := sysvar(951); sv["unit"] != "K" || sv["min"] != 0.0 || sv["max"] != 10.0 || sv["value"] != 10.0 || sv["description"] != "Fühler\tNord\nim Garten" || sv["name"] != "Außentemperatur" {
		t.Fatalf("number not edited: %v", sv)
	}
	// A value list: a value past its end starts over
	edit("e2", message{"id": 952, "kind": "enum", "valueList": []string{"Aus", "An"}})
	if sv := sysvar(952); len(sv["valueList"].([]any)) != 2 || sv["value"] != 1.0 {
		t.Fatalf("enum not edited: %v", sv)
	}
	edit("e3", message{"id": 952, "kind": "enum", "valueList": []string{"Aus"}})
	if sv := sysvar(952); sv["value"] != 0.0 {
		t.Fatalf("value past the list must start over: %v", sv)
	}
	// Presence (binary): the names of its states
	edit("e4", message{"id": 950, "kind": "bool", "falseName": "weg", "trueName": "da"})
	if sv := sysvar(950); sv["falseName"] != "weg" || sv["trueName"] != "da" {
		t.Fatalf("bool not edited: %v", sv)
	}

	for _, bad := range []message{
		{"id": 951, "kind": "number", "min": 5, "max": 5},
		{"id": 952, "kind": "enum"},
		{"id": 950, "kind": "bool", "description": "a^b"},
		{"id": 950, "kind": "bool", "trueName": "x\"y"},
	} {
		if m := edit("bad", bad); m["code"] != "INVALID_VALUE" {
			t.Fatalf("expected INVALID_VALUE for %v, got %v", bad, m)
		}
	}
	// Assigned to a channel, then to none again
	edit("e6", message{"id": 953, "kind": "string", "channel": 401})
	if sv := sysvar(953); sv["channel"] != 401.0 {
		t.Fatalf("channel not assigned: %v", sv)
	}
	edit("e7", message{"id": 953, "kind": "string", "channel": 0})
	if sv := sysvar(953); sv["channel"] != nil {
		t.Fatalf("channel not removed: %v", sv)
	}
	if m := edit("e8", message{"id": 953, "kind": "string", "channel": -1}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
	if m := edit("e5", message{"id": 4242, "kind": "string"}); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}
}

func TestStackClock(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	settings := func(id string) message {
		send(t, conn, message{"type": "getSystemSettings", "requestId": id})
		return receive(t, conn, byRequestID(id))
	}
	m := settings("g1")
	if m["timeServers"] != "pool.ntp.org" || m["timeZone"] != "CET/CEST" || m["canSetClock"] != false {
		t.Fatalf("unexpected clock settings: %v", m)
	}
	if zones, _ := m["timeZones"].([]any); len(zones) < 28 {
		t.Fatalf("expected the WebUI's time zones, got %v", m["timeZones"])
	}

	send(t, conn, message{"type": "setTimeServers", "requestId": "n1", "servers": " ptbtime1.ptb.de   fritz.box "})
	if r := receive(t, conn, byRequestID("n1")); r["success"] != true {
		t.Fatalf("setTimeServers failed: %v", r)
	}
	send(t, conn, message{"type": "setTimeZone", "requestId": "z1", "timeZone": "GMT/BST"})
	if r := receive(t, conn, byRequestID("z1")); r["success"] != true {
		t.Fatalf("setTimeZone failed: %v", r)
	}
	if m := settings("g2"); m["timeServers"] != "ptbtime1.ptb.de fritz.box" || m["timeZone"] != "GMT/BST" || m["city"] != "Berlin" {
		t.Fatalf("clock settings not saved: %v", m)
	}

	for _, bad := range []message{
		{"type": "setTimeServers", "servers": "a';rm -rf /"},
		{"type": "setTimeZone", "timeZone": "Mars/Olympus"},
		{"type": "setClock", "time": "gestern"},
	} {
		bad["requestId"] = "bad"
		send(t, conn, bad)
		if r := receive(t, conn, byRequestID("bad")); r["code"] != "INVALID_VALUE" {
			t.Fatalf("expected INVALID_VALUE for %v, got %v", bad, r)
		}
	}
	// Not on a CCU: the clock is not set by hand
	send(t, conn, message{"type": "setClock", "requestId": "c1", "time": "2026-10-04 12:30:00"})
	if r := receive(t, conn, byRequestID("c1")); r["code"] != "NOT_SUPPORTED" {
		t.Fatalf("expected NOT_SUPPORTED, got %v", r)
	}
}

func TestStackHeatingGroups(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "getHeatingGroups", "requestId": "h"})
	groups := receive(t, conn, byRequestID("h"))["groups"].([]any)
	if len(groups) != 2 {
		t.Fatalf("unexpected groups: %v", groups)
	}
	flur := groups[0].(map[string]any)
	if flur["name"] != "Heizung Flur" || flur["deviceAddress"] != "INT0000001" || flur["type"] != "hmip.heating.group" {
		t.Fatalf("unexpected group: %v", flur)
	}
	if m := flur["members"].([]any)[0].(map[string]any); m["address"] != "000A9D89A7AF25:1" {
		t.Fatalf("unexpected member: %v", m)
	}

	guest, _, err := websocket.DefaultDialer.Dial(fmt.Sprintf("ws://%s/", conn.RemoteAddr().String()), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer guest.Close()
	loginAs(t, guest, "Gast", "gast")
	send(t, guest, message{"type": "getHeatingGroups", "requestId": "g"})
	if m := receive(t, guest, byRequestID("g")); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", m)
	}
}

func TestStackRestoreBackup(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	base := fmt.Sprintf("http://127.0.0.1:%d", wsPorts[ccu])

	upload := func(content string) string {
		t.Helper()
		send(t, conn, message{"type": "prepareRestore", "requestId": "p"})
		prepared := receive(t, conn, byRequestID("p"))
		resp, err := http.Post(base+prepared["url"].(string), "application/octet-stream", strings.NewReader(content))
		if err != nil || resp.StatusCode != http.StatusNoContent {
			t.Fatalf("upload failed: %v %v", err, resp)
		}
		// Once only
		if again, _ := http.Post(base+prepared["url"].(string), "application/octet-stream", strings.NewReader(content)); again.StatusCode != http.StatusNotFound {
			t.Fatal("an upload id must take one file only")
		}
		return prepared["id"].(string)
	}
	call := func(m message) message {
		t.Helper()
		m["requestId"] = "r"
		send(t, conn, m)
		return receive(t, conn, byRequestID("r"))
	}

	// Not a backup
	id := upload("holiday photos")
	if m := call(message{"type": "checkRestore", "id": id, "password": "secret"}); m["code"] != "INVALID_BACKUP" {
		t.Fatalf("expected INVALID_BACKUP, got %v", m)
	}
	// Wrong password
	if m := call(message{"type": "checkRestore", "id": id, "password": "falsch"}); m["code"] != "INVALID_CREDENTIALS" {
		t.Fatalf("expected INVALID_CREDENTIALS, got %v", m)
	}
	// From a newer firmware
	id = upload(fakeccu.FakeBackup + " " + fakeccu.FakeBackupNewer)
	if m := call(message{"type": "restoreBackup", "id": id, "password": "secret"}); m["code"] != "FIRMWARE_TOO_OLD" {
		t.Fatalf("expected FIRMWARE_TOO_OLD, got %v", m)
	}
	// With a security key
	keyed := fakeccu.FakeBackup + " " + fakeccu.FakeBackupKeyed
	id = upload(keyed)
	if m := call(message{"type": "checkRestore", "id": id, "password": "secret"}); m["success"] != true || m["needsKey"] != true {
		t.Fatalf("expected a key to be needed, got %v", m)
	}
	if m := call(message{"type": "restoreBackup", "id": id, "password": "secret", "key": "falsch"}); m["code"] != "WRONG_KEY" {
		t.Fatalf("expected WRONG_KEY, got %v", m)
	}
	if _, rebooted := ccu.RestoredBackup(); rebooted {
		t.Fatal("nothing may be restored with a wrong key")
	}
	if m := call(message{"type": "restoreBackup", "id": id, "password": "secret", "key": fakeccu.FakeBackupKey}); m["success"] != true {
		t.Fatalf("restoreBackup failed: %v", m)
	}
	if restored, rebooted := ccu.RestoredBackup(); restored != keyed || !rebooted {
		t.Fatalf("backup not restored: %q %v", restored, rebooted)
	}
	// The upload is gone afterwards
	if m := call(message{"type": "restoreBackup", "id": id, "password": "secret"}); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}
	// A plain backup needs no key
	id = upload(fakeccu.FakeBackup)
	if m := call(message{"type": "checkRestore", "id": id, "password": "secret"}); m["needsKey"] != false {
		t.Fatalf("expected no key, got %v", m)
	}
}

func TestStackCcuFirmware(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	base := fmt.Sprintf("http://127.0.0.1:%d", wsPorts[ccu])

	upload := func(content string) string {
		t.Helper()
		send(t, conn, message{"type": "prepareCcuFirmware", "requestId": "p"})
		prepared := receive(t, conn, byRequestID("p"))
		resp, err := http.Post(base+prepared["url"].(string), "application/octet-stream", strings.NewReader(content))
		if err != nil || resp.StatusCode != http.StatusNoContent {
			t.Fatalf("upload failed: %v %v", err, resp)
		}
		return prepared["id"].(string)
	}
	call := func(m message) message {
		t.Helper()
		m["requestId"] = "r"
		send(t, conn, m)
		return receive(t, conn, byRequestID("r"))
	}

	if m := call(message{"type": "checkCcuFirmware", "id": upload("holiday photos"), "password": "secret"}); m["code"] != "INVALID_FIRMWARE" {
		t.Fatalf("expected INVALID_FIRMWARE, got %v", m)
	}
	// Checked, then cancelled: nothing installed
	if m := call(message{"type": "checkCcuFirmware", "id": upload(fakeccu.FakeFirmware), "password": "secret"}); m["success"] != true || m["eula"] != nil {
		t.Fatalf("checkCcuFirmware failed: %v", m)
	}
	call(message{"type": "cancelCcuFirmware", "password": "secret"})
	if m := call(message{"type": "installCcuFirmware", "password": "secret"}); m["success"] != true || ccu.InstalledFirmware() != "" {
		t.Fatalf("a cancelled update must not be installed: %v %q", m, ccu.InstalledFirmware())
	}
	// With a licence text, installed
	firmware := fakeccu.FakeFirmware + " " + fakeccu.FakeFirmwareEula
	id := upload(firmware)
	if m := call(message{"type": "checkCcuFirmware", "id": id, "password": "secret", "language": "de"}); m["eula"] != "Lizenzbedingungen der Fake-Firmware" {
		t.Fatalf("expected the licence text, got %v", m)
	}
	// The CCU has the file now
	if m := call(message{"type": "checkCcuFirmware", "id": id, "password": "secret"}); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}
	if m := call(message{"type": "installCcuFirmware", "password": "falsch"}); m["code"] != "INVALID_CREDENTIALS" {
		t.Fatalf("expected INVALID_CREDENTIALS, got %v", m)
	}
	if m := call(message{"type": "installCcuFirmware", "password": "secret"}); m["success"] != true || ccu.InstalledFirmware() != firmware {
		t.Fatalf("firmware not installed: %v %q", m, ccu.InstalledFirmware())
	}
}

func TestStackInstallAddon(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	base := fmt.Sprintf("http://127.0.0.1:%d", wsPorts[ccu])

	install := func(content string) message {
		t.Helper()
		send(t, conn, message{"type": "prepareAddonUpload", "requestId": "p"})
		prepared := receive(t, conn, byRequestID("p"))
		resp, err := http.Post(base+prepared["url"].(string), "application/octet-stream", strings.NewReader(content))
		if err != nil || resp.StatusCode != http.StatusNoContent {
			t.Fatalf("upload failed: %v %v", err, resp)
		}
		send(t, conn, message{"type": "installAddon", "requestId": "i", "id": prepared["id"], "password": "secret"})
		return receive(t, conn, byRequestID("i"))
	}

	if m := install("not an add-on"); m["code"] != "ADDON_FAILED" || !strings.Contains(m["error"].(string), "Error (2)") {
		t.Fatalf("expected ADDON_FAILED, got %v", m)
	}
	if m := install(fakeccu.FakeAddon); m["success"] != true || m["reboot"] != nil {
		t.Fatalf("installAddon failed: %v", m)
	}
	if m := install(fakeccu.FakeAddon + " " + fakeccu.FakeAddonReboot); m["success"] != true || m["reboot"] != true {
		t.Fatalf("expected a reboot, got %v", m)
	}
	if got := ccu.InstalledAddons(); len(got) != 2 {
		t.Fatalf("unexpected installed add-ons: %v", got)
	}
}

func TestStackDiagrams(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	send(t, conn, message{"type": "getDiagrams", "requestId": "d1"})
	if m := receive(t, conn, byRequestID("d1")); len(m["diagrams"].([]any)) != 0 {
		t.Fatalf("diagrams: %v", m)
	}
	// The thermostat's channel is logged: its system protocol fills the
	// diagram from the start
	send(t, conn, message{"type": "setChannelOption", "requestId": "d2", "id": 401, "option": "logged", "value": true})
	receive(t, conn, byRequestID("d2"))

	diagram := map[string]any{"name": "Wohnzimmer", "period": "week", "series": []any{
		map[string]any{"address": "LEQ0000004:1", "datapoint": "ACTUAL_TEMPERATURE", "color": "#ef4444", "unit": "°C"},
		map[string]any{"address": "sysvar", "datapoint": "951"},
	}}
	send(t, conn, message{"type": "saveDiagram", "requestId": "d3", "diagram": diagram})
	saved := receive(t, conn, byRequestID("d3"))
	if saved["success"] != true {
		t.Fatalf("save: %v", saved)
	}
	id := saved["diagram"].(map[string]any)["id"].(string)

	query := func(requestID string, from, to time.Time) []any {
		send(t, conn, message{"type": "getDiagramData", "requestId": requestID, "from": from.UnixMilli(), "to": to.UnixMilli(), "buckets": 500,
			"series": []any{map[string]any{"address": "LEQ0000004:1", "datapoint": "ACTUAL_TEMPERATURE"}, map[string]any{"address": "sysvar", "datapoint": "951"}}})
		return receive(t, conn, byRequestID(requestID))["series"].([]any)
	}
	points := func(series any) []any {
		return series.(map[string]any)["points"].([]any)
	}
	now := time.Now()
	// The 24 hourly values of the fake system protocol (2026-10-03) and the
	// current value
	series := query("d4", time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), now.Add(time.Hour))
	if n := len(points(series[0])); n != 25 {
		t.Errorf("temperature points: %d %v", n, series[0])
	}
	// The system variable's current value
	if p := points(series[1]); len(p) != 1 || p[0].([]any)[1] != 12.5 {
		t.Errorf("sysvar points: %v", p)
	}

	// New values arrive as events
	if err := ccu.SetValue("BidCos-RF", "LEQ0000004:1", "ACTUAL_TEMPERATURE", 23.5); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(5 * time.Second)
	for {
		p := points(query("d5", now.Add(-time.Hour), time.Now().Add(time.Hour))[0])
		if last := p[len(p)-1].([]any); last[3] == 23.5 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("event not recorded: %v", p)
		}
		time.Sleep(50 * time.Millisecond)
	}

	// Changing needs administrators with the password entered
	guest, _, err := websocket.DefaultDialer.Dial(fmt.Sprintf("ws://%s/", conn.RemoteAddr().String()), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer guest.Close()
	loginAs(t, guest, "Gast", "gast")
	send(t, guest, message{"type": "deleteDiagram", "requestId": "g1", "id": id})
	if m := receive(t, guest, byRequestID("g1")); m["code"] != "FORBIDDEN" {
		t.Errorf("guest deleted: %v", m)
	}
	send(t, guest, message{"type": "getDiagrams", "requestId": "g2"})
	if m := receive(t, guest, byRequestID("g2")); len(m["diagrams"].([]any)) != 1 {
		t.Errorf("guest sees: %v", m)
	}

	send(t, conn, message{"type": "saveDiagram", "requestId": "d6", "diagram": map[string]any{"name": "", "series": []any{}}})
	if m := receive(t, conn, byRequestID("d6")); m["code"] != "INVALID_VALUE" {
		t.Errorf("invalid saved: %v", m)
	}
	send(t, conn, message{"type": "deleteDiagram", "requestId": "d7", "id": id})
	if m := receive(t, conn, byRequestID("d7")); m["success"] != true {
		t.Errorf("delete: %v", m)
	}
	send(t, conn, message{"type": "deleteDiagram", "requestId": "d8", "id": id})
	if m := receive(t, conn, byRequestID("d8")); m["code"] != "NOT_FOUND" {
		t.Errorf("delete twice: %v", m)
	}
}

func TestStackGeneralSettings(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	send(t, conn, message{"type": "getGeneralSettings", "requestId": "g1"})
	m := receive(t, conn, byRequestID("g1"))
	price := m["energyPrice"].(map[string]any)
	if price["currency"] != "EUR" || price["electricity"] != 0.0 || m["infoLed"].(map[string]any)["service"] != true ||
		m["hideStickyUnreach"] != false || len(m["currencies"].([]any)) != 5 || m["storage"].(map[string]any)["total"].(float64) <= 0 {
		t.Fatalf("settings: %v", m)
	}

	stickyBefore := false
	send(t, conn, message{"type": "getServiceMessages", "requestId": "g2"})
	for _, item := range receive(t, conn, byRequestID("g2"))["messages"].([]any) {
		stickyBefore = stickyBefore || item.(map[string]any)["type"] == "STICKY_UNREACH"
	}

	send(t, conn, message{"type": "setGeneralSettings", "requestId": "g3",
		"energyPrice":       map[string]any{"currency": "EUR", "electricity": 0.32, "gas": 0.11, "gasHeatingValue": 11.3, "gasConditionNumber": 0.95},
		"infoLed":           map[string]any{"service": false, "alarm": true},
		"hideStickyUnreach": true, "betaFirmware": false})
	if m := receive(t, conn, byRequestID("g3")); m["success"] != true {
		t.Fatalf("set: %v", m)
	}
	send(t, conn, message{"type": "getGeneralSettings", "requestId": "g4"})
	m = receive(t, conn, byRequestID("g4"))
	if m["energyPrice"].(map[string]any)["electricity"] != 0.32 || m["infoLed"].(map[string]any)["service"] != false || m["hideStickyUnreach"] != true {
		t.Errorf("after set: %v", m)
	}

	// Messages of devices that were unreachable are hidden and acknowledged
	sticky := func(id string) bool {
		send(t, conn, message{"type": "getServiceMessages", "requestId": id})
		for _, item := range receive(t, conn, byRequestID(id))["messages"].([]any) {
			if item.(map[string]any)["type"] == "STICKY_UNREACH" {
				return true
			}
		}
		return false
	}
	if !stickyBefore {
		t.Fatal("the fixture has no sticky unreach message")
	}
	if sticky("g5") {
		t.Error("sticky unreach shown")
	}
	// Acknowledged: gone without the option too
	send(t, conn, message{"type": "setGeneralSettings", "requestId": "g5b",
		"energyPrice": map[string]any{"currency": "EUR", "electricity": 0.32, "gas": 0.11, "gasHeatingValue": 11.3, "gasConditionNumber": 0.95},
		"infoLed":     map[string]any{"service": false, "alarm": true}, "hideStickyUnreach": false})
	receive(t, conn, byRequestID("g5b"))
	deadline := time.Now().Add(3 * time.Second)
	for i := 0; sticky(fmt.Sprintf("g5c%d", i)); i++ {
		if time.Now().After(deadline) {
			t.Fatal("sticky unreach not acknowledged")
		}
		time.Sleep(50 * time.Millisecond)
	}

	// The prices come with the diagrams
	send(t, conn, message{"type": "getDiagrams", "requestId": "g6"})
	if m := receive(t, conn, byRequestID("g6")); m["energyPrice"].(map[string]any)["electricity"] != 0.32 {
		t.Errorf("diagrams: %v", m)
	}

	send(t, conn, message{"type": "setGeneralSettings", "requestId": "g7", "energyPrice": map[string]any{"currency": "USD"}})
	if m := receive(t, conn, byRequestID("g7")); m["code"] != "INVALID_VALUE" {
		t.Errorf("invalid currency: %v", m)
	}
}

func TestStackEditHeatingGroups(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	send(t, conn, message{"type": "getHeatingGroupMembers", "requestId": "h1", "groupType": "hmip.heating.group"})
	members := receive(t, conn, byRequestID("h1"))["members"].(map[string]any)
	if len(members["assignable"].([]any)) != 0 || members["leftover"].([]any)[0].(map[string]any)["id"] != "000A9D89A7AF25:1" {
		t.Fatalf("members: %v", members)
	}

	group := map[string]any{"id": 0, "name": "Bad & Küche", "type": "hmip.heating.group", "forbidSingleOperation": false, "members": []string{}}
	send(t, conn, message{"type": "saveHeatingGroup", "requestId": "h2", "group": group})
	if m := receive(t, conn, byRequestID("h2")); m["code"] != "PASSWORD_REQUIRED" {
		t.Fatalf("without password: %v", m)
	}
	send(t, conn, message{"type": "saveHeatingGroup", "requestId": "h3", "group": group, "password": "falsch"})
	if m := receive(t, conn, byRequestID("h3")); m["code"] != "INVALID_CREDENTIALS" {
		t.Fatalf("wrong password: %v", m)
	}
	send(t, conn, message{"type": "saveHeatingGroup", "requestId": "h4", "group": group, "password": "secret"})
	saved := receive(t, conn, byRequestID("h4"))
	if saved["success"] != true || saved["id"] != 3.0 {
		t.Fatalf("save: %v", saved)
	}
	// The virtual device is named and leaves the inbox
	waitFor := func(what string, ok func() bool) {
		deadline := time.Now().Add(5 * time.Second)
		for !ok() {
			if time.Now().After(deadline) {
				t.Fatal(what)
			}
			time.Sleep(50 * time.Millisecond)
		}
	}
	waitFor("group device not named", func() bool { return ccu.DeviceName("INT0000003") == "Bad & Küche INT0000003" })

	// The session is kept: no password for the next changes. The
	// thermostat moves from group 1 to the new one.
	send(t, conn, message{"type": "saveHeatingGroup", "requestId": "h5", "group": map[string]any{"id": 1, "name": "Heizung Flur", "type": "hmip.heating.group", "members": []string{}}})
	if m := receive(t, conn, byRequestID("h5")); m["success"] != true {
		t.Fatalf("change: %v", m)
	}
	waitFor("member not released", func() bool { return ccu.InHeatingGroup()["000A9D89A7AF25"] == "false" })
	group["id"] = 3
	group["members"] = []string{"000A9D89A7AF25:1"}
	send(t, conn, message{"type": "saveHeatingGroup", "requestId": "h6", "group": group})
	if m := receive(t, conn, byRequestID("h6")); m["success"] != true {
		t.Fatalf("add member: %v", m)
	}
	waitFor("member not marked", func() bool { return ccu.InHeatingGroup()["000A9D89A7AF25"] == "true" })

	send(t, conn, message{"type": "getHeatingGroups", "requestId": "h7"})
	groups := receive(t, conn, byRequestID("h7"))["groups"].([]any)
	if len(groups) != 3 {
		t.Fatalf("groups: %v", groups)
	}
	third := groups[2].(map[string]any)
	if third["name"] != "Bad & Küche" || len(third["members"].([]any)) != 1 || len(groups[0].(map[string]any)["members"].([]any)) != 0 {
		t.Errorf("after changes: %v", groups)
	}

	send(t, conn, message{"type": "deleteHeatingGroup", "requestId": "h8", "id": 3})
	if m := receive(t, conn, byRequestID("h8")); m["success"] != true {
		t.Fatalf("delete: %v", m)
	}
	waitFor("member not released after delete", func() bool { return ccu.InHeatingGroup()["000A9D89A7AF25"] == "false" })
	send(t, conn, message{"type": "deleteHeatingGroup", "requestId": "h9", "id": 3})
	if m := receive(t, conn, byRequestID("h9")); m["code"] != "NOT_FOUND" {
		t.Errorf("delete twice: %v", m)
	}
	send(t, conn, message{"type": "saveHeatingGroup", "requestId": "h10", "group": map[string]any{"id": 0, "name": "", "type": "hmip.heating.group"}})
	if m := receive(t, conn, byRequestID("h10")); m["code"] != "INVALID_VALUE" {
		t.Errorf("no name: %v", m)
	}
}

func TestStackSecurity(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	send(t, conn, message{"type": "getSecurity", "requestId": "s1"})
	if m := receive(t, conn, byRequestID("s1")); m["ssh"] != false || m["auth"] != false || m["httpsRedirect"] != false || m["sessionTimeout"] != 300.0 {
		t.Fatalf("security: %v", m)
	}
	// The session timeout is written to rega.conf (no WebUI session needed)
	send(t, conn, message{"type": "setSessionTimeout", "requestId": "t1", "seconds": 100})
	if m := receive(t, conn, byRequestID("t1")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("too short: %v", m)
	}
	send(t, conn, message{"type": "setSessionTimeout", "requestId": "t2", "seconds": 420})
	if m := receive(t, conn, byRequestID("t2")); m["success"] != true {
		t.Fatalf("timeout: %v", m)
	}
	if data, _ := os.ReadFile(filepath.Join(ccu.ConfigDir, "rega.conf")); !strings.Contains(string(data), "SessionTimeout=420") {
		t.Fatalf("rega.conf: %s", data)
	}
	change := message{"type": "setSecurity", "requestId": "s2", "ssh": true, "sshPassword": "geheim123", "auth": true, "httpsRedirect": false}
	send(t, conn, change)
	if m := receive(t, conn, byRequestID("s2")); m["code"] != "PASSWORD_REQUIRED" {
		t.Fatalf("without password: %v", m)
	}
	change["requestId"] = "s3"
	change["password"] = "secret"
	send(t, conn, change)
	if m := receive(t, conn, byRequestID("s3")); m["success"] != true {
		t.Fatalf("set: %v", m)
	}
	send(t, conn, message{"type": "getSecurity", "requestId": "s4"})
	if m := receive(t, conn, byRequestID("s4")); m["ssh"] != true || m["auth"] != true || m["httpsRedirect"] != false {
		t.Errorf("after set: %v", m)
	}
	if ccu.SSHPassword != "geheim123" || ccu.CallCount("JSON CCU.restartSSHDaemon") != 1 {
		t.Errorf("ssh: %q %d", ccu.SSHPassword, ccu.CallCount("JSON CCU.restartSSHDaemon"))
	}
	// lighttpd restarts after the answer, with the kept session
	deadline := time.Now().Add(3 * time.Second)
	for ccu.CallCount("JSON User.restartLighttpd") == 0 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if ccu.CallCount("JSON User.restartLighttpd") != 1 {
		t.Error("lighttpd not restarted")
	}

	// The key with the kept session
	send(t, conn, message{"type": "changeSecurityKey", "requestId": "s5", "key": "kurz"})
	if m := receive(t, conn, byRequestID("s5")); m["code"] != "INVALID_VALUE" {
		t.Errorf("short key: %v", m)
	}
	send(t, conn, message{"type": "changeSecurityKey", "requestId": "s6", "key": "Neuer_Schluessel1"})
	if m := receive(t, conn, byRequestID("s6")); m["success"] != true || ccu.SecurityKey != "Neuer_Schluessel1" {
		t.Errorf("key: %v %q", m, ccu.SecurityKey)
	}
	send(t, conn, message{"type": "changeSecurityKey", "requestId": "s7", "key": "Neuer_Schluessel1"})
	if m := receive(t, conn, byRequestID("s7")); m["code"] != "KEY_SAME" {
		t.Errorf("same key: %v", m)
	}
	// Neither the key nor the SSH password are in the audit log
	data, _ := os.ReadFile(auditLogs[ccu])
	if strings.Contains(string(data), "Neuer_Schluessel1") || strings.Contains(string(data), "geheim123") {
		t.Errorf("secret in the audit log: %s", data)
	}
}

// SNMP as cp_security.cgi's onSNMPSaveBtn: CCU.setSNMPEnabled with a user
// and a password of at least 8 characters; the state is snmpd-ccu3.conf
// The health of all devices: maintenance values from ReGa, and the voltage
// at which HmIP devices report LOW_BAT from their MASTER paramset
func TestStackDeviceHealth(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "getDeviceHealth", "requestId": "h1"})
	m := receive(t, conn, byRequestID("h1"))
	devices, _ := m["devices"].([]any)
	byAddress := map[string]map[string]any{}
	for _, d := range devices {
		device := d.(map[string]any)
		byAddress[device["address"].(string)] = device
	}
	bath := byAddress["003660C9930AB6"]
	if bath == nil || bath["name"] != "Fensterkontakt Bad" || bath["lowBatLimit"] != 1.1 {
		t.Fatalf("bath contact: %v", bath)
	}
	values := bath["values"].(map[string]any)
	if values["LOW_BAT"].(map[string]any)["value"] != true || values["OPERATING_VOLTAGE"].(map[string]any)["value"] != 1.0 {
		t.Fatalf("bath values: %v", values)
	}
	// BidCos: LOWBAT as LOW_BAT, no limit
	bidcos := byAddress["LEQ0000001"]
	if bidcos == nil || bidcos["lowBatLimit"] != nil || bidcos["values"].(map[string]any)["LOW_BAT"] == nil {
		t.Fatalf("bidcos: %v", bidcos)
	}
}

func TestStackSNMP(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	send(t, conn, message{"type": "getSecurity", "requestId": "n1"})
	if m := receive(t, conn, byRequestID("n1")); m["snmp"] != false {
		t.Fatalf("snmp on at start: %v", m)
	}
	send(t, conn, message{"type": "setSnmp", "requestId": "n2", "snmp": true, "snmpUser": "monitor", "snmpPassword": "kurz", "password": "secret"})
	if m := receive(t, conn, byRequestID("n2")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("short password: %v", m)
	}
	send(t, conn, message{"type": "setSnmp", "requestId": "n3", "snmp": true, "snmpUser": "monitor", "snmpPassword": "Snmp-Geheim9", "password": "secret"})
	if m := receive(t, conn, byRequestID("n3")); m["success"] != true || ccu.SNMPUser != "monitor" {
		t.Fatalf("enable: %v %q", m, ccu.SNMPUser)
	}
	send(t, conn, message{"type": "getSecurity", "requestId": "n4"})
	if m := receive(t, conn, byRequestID("n4")); m["snmp"] != true {
		t.Fatalf("snmp off after enabling: %v", m)
	}
	send(t, conn, message{"type": "setSnmp", "requestId": "n5", "snmp": false})
	if m := receive(t, conn, byRequestID("n5")); m["success"] != true || ccu.SNMPUser != "" {
		t.Fatalf("disable: %v", m)
	}
	if _, err := os.Stat(filepath.Join(ccu.ConfigDir, "snmp", "snmpd-ccu3.conf")); err == nil {
		t.Fatal("config still there")
	}
	if data, _ := os.ReadFile(auditLogs[ccu]); strings.Contains(string(data), "Snmp-Geheim9") {
		t.Errorf("SNMP password in the audit log: %s", data)
	}
}

func TestStackNetwork(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "getNetwork", "requestId": "n1"})
	m := receive(t, conn, byRequestID("n1"))
	config := m["config"].(map[string]any)
	if config["dhcp"] != true || config["hostname"] != "homematic-ccu3" || m["tailscale"].(map[string]any)["available"] != false {
		t.Fatalf("network: %v", m)
	}
	manual := map[string]any{"dhcp": false, "hostname": "ccu-keller", "ip": "192.168.178.30", "netmask": "255.255.255.0", "gateway": "192.168.178.1", "dns1": "192.168.178.1", "dns2": ""}
	send(t, conn, message{"type": "setNetwork", "requestId": "n2", "config": manual})
	if m := receive(t, conn, byRequestID("n2")); m["success"] != true {
		t.Fatalf("set: %v", m)
	}
	send(t, conn, message{"type": "getNetwork", "requestId": "n3"})
	if c := receive(t, conn, byRequestID("n3"))["config"].(map[string]any); c["dhcp"] != false || c["ip"] != "192.168.178.30" || c["hostname"] != "ccu-keller" {
		t.Errorf("after set: %v", c)
	}
	manual["gateway"] = "10.0.0.1"
	send(t, conn, message{"type": "setNetwork", "requestId": "n4", "config": manual})
	if m := receive(t, conn, byRequestID("n4")); m["code"] != "INVALID_VALUE" {
		t.Errorf("gateway outside: %v", m)
	}
}

func TestStackFirewall(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "getFirewall", "requestId": "f1"})
	fw := receive(t, conn, byRequestID("f1"))["firewall"].(map[string]any)
	if fw["mode"] != "RESTRICTIVE" || len(fw["ips"].([]any)) != 2 || len(fw["services"].([]any)) != 4 {
		t.Fatalf("firewall: %v", fw)
	}
	next := map[string]any{
		"mode": "RESTRICTIVE", "ips": []string{"192.168.178.0/24"}, "userPorts": []string{"1883"},
		"services": []map[string]any{{"id": "XMLRPC", "ports": []int{}, "access": "full"}, {"id": "REGA", "ports": []int{}, "access": "restricted"}, {"id": "NEOSERVER", "ports": []int{}, "access": "none"}},
	}
	send(t, conn, message{"type": "setFirewall", "requestId": "f2", "firewall": next})
	if m := receive(t, conn, byRequestID("f2")); m["code"] != "PASSWORD_REQUIRED" {
		t.Fatalf("without password: %v", m)
	}
	send(t, conn, message{"type": "setFirewall", "requestId": "f3", "firewall": next, "password": "secret"})
	if m := receive(t, conn, byRequestID("f3")); m["success"] != true || ccu.CallCount("JSON Firewall.setConfiguration") != 1 {
		t.Fatalf("set: %v", m)
	}
	send(t, conn, message{"type": "getFirewall", "requestId": "f4"})
	fw = receive(t, conn, byRequestID("f4"))["firewall"].(map[string]any)
	if fw["ips"].([]any)[0] != "192.168.178.0/24" || fw["userPorts"].([]any)[0] != "1883" {
		t.Errorf("after set: %v", fw)
	}
	for _, s := range fw["services"].([]any) {
		if s := s.(map[string]any); s["id"] == "XMLRPC" && s["access"] != "full" {
			t.Errorf("xmlrpc: %v", s)
		}
	}
	next["ips"] = []string{"192.168.178"}
	send(t, conn, message{"type": "setFirewall", "requestId": "f5", "firewall": next})
	if m := receive(t, conn, byRequestID("f5")); m["code"] != "INVALID_VALUE" {
		t.Errorf("invalid address: %v", m)
	}
}

func TestStackLanGateways(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "getLanGateways", "requestId": "g1"})
	m := receive(t, conn, byRequestID("g1"))
	gateways, modules := m["gateways"].([]any), m["modules"].([]any)
	if len(gateways) != 1 || len(modules) != 2 {
		t.Fatalf("gateways: %v", m)
	}
	if g := gateways[0].(map[string]any); g["serial"] != "NEQ0987654" || g["state"] != "connected" || g["name"] != "Keller" {
		t.Fatalf("gateway: %v", g)
	}
	next := []map[string]any{
		{"class": "RF", "type": "HMLGW2", "name": "Keller", "serial": "NEQ0987654", "key": "KellerKey1", "ip": "192.168.178.40"},
		{"class": "Wired", "type": "HMWLGW", "name": "", "serial": "JEQ0000001", "key": "wired1", "ip": ""},
	}
	send(t, conn, message{"type": "setLanGateways", "requestId": "g2", "gateways": next})
	if m := receive(t, conn, byRequestID("g2")); m["code"] != "PASSWORD_REQUIRED" {
		t.Fatalf("without password: %v", m)
	}
	send(t, conn, message{"type": "setLanGateways", "requestId": "g3", "gateways": next, "password": "secret"})
	if m := receive(t, conn, byRequestID("g3")); m["success"] != true || ccu.CallCount("JSON BidCoS_Wired.setConfigurationWired") != 1 {
		t.Fatalf("set: %v", m)
	}
	send(t, conn, message{"type": "getLanGateways", "requestId": "g4"})
	gateways = receive(t, conn, byRequestID("g4"))["gateways"].([]any)
	if len(gateways) != 2 || gateways[1].(map[string]any)["state"] != "inactive" {
		t.Fatalf("after set: %v", gateways)
	}
	// The kept session needs no password now
	send(t, conn, message{"type": "changeLanGatewayKey", "requestId": "g5", "serial": "NEQ0987654", "key": "Neu#1"})
	if m := receive(t, conn, byRequestID("g5")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("forbidden character: %v", m)
	}
	send(t, conn, message{"type": "changeLanGatewayKey", "requestId": "g6", "serial": "NEQ0987654", "key": "NeuerKey2"})
	if m := receive(t, conn, byRequestID("g6")); m["success"] != true {
		t.Fatalf("change key: %v", m)
	}
	if data, _ := os.ReadFile(filepath.Join(ccu.ConfigDir, "NEQ0987654.keychange")); !strings.Contains(string(data), "KEY=NeuerKey2") || !strings.Contains(string(data), "CURKEY=KellerKey1") {
		t.Errorf("keychange: %s", data)
	}
	send(t, conn, message{"type": "setBidcosInterface", "requestId": "g7", "address": "LEQ0000001", "module": "NEQ0987654", "roaming": false})
	if m := receive(t, conn, byRequestID("g7")); m["success"] != true {
		t.Fatalf("assign: %v", m)
	}
	send(t, conn, message{"type": "setBidcosInterface", "requestId": "g8", "address": "LEQ0000001", "module": "XYZ", "roaming": false})
	if m := receive(t, conn, byRequestID("g8")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("unknown module: %v", m)
	}
	send(t, conn, message{"type": "listDevices", "requestId": "g9"})
	for _, d := range receive(t, conn, byRequestID("g9"))["devices"].([]any) {
		if d := d.(map[string]any); d["address"] == "LEQ0000001" && d["interface"] != "NEQ0987654" {
			t.Errorf("assigned device: %v", d)
		}
	}
}

func TestStackPairingWithKeyAndSerial(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	// HmIP without the key server: SGTIN and KEY as on the label
	send(t, conn, message{"type": "setInstallMode", "requestId": "p1", "interfaceName": "HmIP-RF", "on": true, "seconds": 60,
		"sgtin": "3014-F711-A000-1F98-A9B4-C2D1", "key": "00112233445566778899aabbccddeeff"})
	if m := receive(t, conn, byRequestID("p1")); m["success"] != true {
		t.Fatalf("whitelist: %v", m)
	}
	if len(ccu.Whitelist) != 1 || ccu.Whitelist[0]["ADDRESS"] != "3014F711A0001F98A9B4C2D1" || ccu.Whitelist[0]["KEY"] != "00112233445566778899AABBCCDDEEFF" || ccu.Whitelist[0]["KEY_MODE"] != "LOCAL" {
		t.Fatalf("whitelist: %v", ccu.Whitelist)
	}
	send(t, conn, message{"type": "setInstallMode", "requestId": "p2", "interfaceName": "HmIP-RF", "on": true, "seconds": 60, "sgtin": "3014", "key": "x"})
	if m := receive(t, conn, byRequestID("p2")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("invalid SGTIN: %v", m)
	}
	audit, _ := os.ReadFile(auditLogs[ccu])
	if strings.Contains(string(audit), "AABBCCDDEEFF") || strings.Contains(strings.ToUpper(string(audit)), "00112233445566778899AABBCCDDEEFF") {
		t.Error("the device key is in the audit log")
	}

	// BidCos by serial number; a foreign security key needs the temporary key
	send(t, conn, message{"type": "addDeviceBySerial", "requestId": "p3", "interfaceName": "BidCos-RF", "address": "leq0012345"})
	if m := receive(t, conn, byRequestID("p3")); m["success"] != true {
		t.Fatalf("serial: %v", m)
	}
	send(t, conn, message{"type": "addDeviceBySerial", "requestId": "p4", "interfaceName": "BidCos-RF", "address": "KEQ0000001"})
	if m := receive(t, conn, byRequestID("p4")); m["code"] != "KEY_MISMATCH" {
		t.Fatalf("key mismatch: %v", m)
	}
	send(t, conn, message{"type": "getInstallMode", "requestId": "p5", "interfaceName": "BidCos-RF"})
	if m := receive(t, conn, byRequestID("p5")); m["keyMismatch"] != "KEQ0000001" {
		t.Fatalf("mismatch device: %v", m)
	}
	send(t, conn, message{"type": "setTempKey", "requestId": "p6", "interfaceName": "BidCos-RF", "key": "AlterSchluessel"})
	if m := receive(t, conn, byRequestID("p6")); m["success"] != true {
		t.Fatalf("temp key: %v", m)
	}
	send(t, conn, message{"type": "addDeviceBySerial", "requestId": "p7", "interfaceName": "BidCos-RF", "address": "KEQ0000001"})
	if m := receive(t, conn, byRequestID("p7")); m["success"] != true {
		t.Fatalf("with temp key: %v", m)
	}
	send(t, conn, message{"type": "getInbox", "requestId": "p8"})
	found := map[string]bool{}
	for _, d := range receive(t, conn, byRequestID("p8"))["devices"].([]any) {
		found[d.(map[string]any)["address"].(string)] = true
	}
	if !found["LEQ0012345"] || !found["KEQ0000001"] || !found["001F98A9B4C2D1"] {
		t.Fatalf("inbox: %v", found)
	}
}

func TestStackFactoryReset(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	ccu.SecurityKey = "Schluessel1"
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "factoryReset", "requestId": "r1"})
	if m := receive(t, conn, byRequestID("r1")); m["code"] != "PASSWORD_REQUIRED" {
		t.Fatalf("without password: %v", m)
	}
	send(t, conn, message{"type": "factoryReset", "requestId": "r2", "password": "secret"})
	if m := receive(t, conn, byRequestID("r2")); m["code"] != "KEY_REQUIRED" {
		t.Fatalf("without key: %v", m)
	}
	// The WebUI session from r2 is kept, but the reset asks for the
	// password every time
	send(t, conn, message{"type": "factoryReset", "requestId": "r2b", "key": "Schluessel1"})
	if m := receive(t, conn, byRequestID("r2b")); m["code"] != "PASSWORD_REQUIRED" {
		t.Fatalf("reset without the password again: %v", m)
	}
	send(t, conn, message{"type": "factoryReset", "requestId": "r3", "key": "falsch", "password": "secret"})
	if m := receive(t, conn, byRequestID("r3")); m["code"] != "KEY_WRONG" {
		t.Fatalf("wrong key: %v", m)
	}
	if ccu.FactoryResetDone() {
		t.Fatal("reset with a wrong key")
	}
	send(t, conn, message{"type": "factoryReset", "requestId": "r4", "key": "Schluessel1", "password": "secret"})
	if m := receive(t, conn, byRequestID("r4")); m["success"] != true {
		t.Fatalf("reset: %v", m)
	}
	// The reset runs after the answer
	deadline := time.Now().Add(5 * time.Second)
	for !ccu.FactoryResetDone() && time.Now().Before(deadline) {
		time.Sleep(50 * time.Millisecond)
	}
	if !ccu.FactoryResetDone() {
		t.Fatal("not reset")
	}
}

func TestStackSecurityLevel(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	level := func(id string) string {
		send(t, conn, message{"type": "getSecurity", "requestId": id})
		return fmt.Sprint(receive(t, conn, byRequestID(id))["securityLevel"])
	}
	// The fixture's firewall restricts two services and leaves one open
	if got := level("l1"); got != "CUSTOM" {
		t.Fatalf("level: %s", got)
	}
	send(t, conn, message{"type": "setSecurityLevel", "requestId": "l2", "level": "HIGH", "password": "secret"})
	if m := receive(t, conn, byRequestID("l2")); m["success"] != true {
		t.Fatalf("set: %v", m)
	}
	if got := level("l3"); got != "HIGH" {
		t.Fatalf("after HIGH: %s", got)
	}
	send(t, conn, message{"type": "setSecurityLevel", "requestId": "l4", "level": "LOW"})
	if m := receive(t, conn, byRequestID("l4")); m["success"] != true {
		t.Fatalf("set: %v", m)
	}
	if got := level("l5"); got != "LOW" {
		t.Fatalf("after LOW: %s", got)
	}
	send(t, conn, message{"type": "getFirewall", "requestId": "l6"})
	if fw := receive(t, conn, byRequestID("l6"))["firewall"].(map[string]any); fw["mode"] != "MOST_OPEN" || len(fw["ips"].([]any)) != 2 {
		t.Errorf("firewall: %v", fw)
	}
	send(t, conn, message{"type": "setSecurityLevel", "requestId": "l7", "level": "SUPER"})
	if m := receive(t, conn, byRequestID("l7")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("unknown level: %v", m)
	}
	_ = ccu
}

func TestStackDeviceFirmware(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	base := fmt.Sprintf("http://127.0.0.1:%d", wsPorts[ccu])

	send(t, conn, message{"type": "getDeviceFirmware", "requestId": "d1"})
	if files := receive(t, conn, byRequestID("d1"))["files"].([]any); len(files) != 0 {
		t.Fatalf("unexpected firmware: %v", files)
	}

	// eQ-3's list, by device type as the CCU names it
	send(t, conn, message{"type": "checkDeviceFirmware", "requestId": "d2"})
	versions := map[string]string{}
	for _, raw := range receive(t, conn, byRequestID("d2"))["versions"].([]any) {
		v := raw.(map[string]any)
		versions[v["type"].(string)] = v["version"].(string)
	}
	if versions["hmip-wrc2"] != "1.6.4" || versions["hmip-hap-b1"] != "2.4.0" {
		t.Fatalf("unexpected versions: %v", versions)
	}

	// Downloading needs a WebUI session for the HMServer
	send(t, conn, message{"type": "downloadDeviceFirmware", "requestId": "d3", "deviceType": "HmIP-WRC2"})
	if m := receive(t, conn, byRequestID("d3")); m["code"] != "PASSWORD_REQUIRED" {
		t.Fatalf("expected PASSWORD_REQUIRED, got %v", m)
	}
	send(t, conn, message{"type": "downloadDeviceFirmware", "requestId": "d4", "deviceType": "HmIP-WRC2", "password": "secret"})
	m := receive(t, conn, byRequestID("d4"))
	files, _ := m["files"].([]any)
	if m["success"] != true || len(files) != 1 {
		t.Fatalf("download failed: %v", m)
	}
	file := files[0].(map[string]any)
	if file["name"] != "HmIP-WRC2" || file["version"] != "1.6.4" || file["changelog"] != true || file["minCcuVersion"] != "3.41.0" {
		t.Fatalf("unexpected firmware: %v", file)
	}
	if n := ccu.CallCount("update server /firmware/download"); n != 1 {
		t.Fatalf("expected one download, got %d", n)
	}
	// The interface processes read the directory again: the remote control
	// gets the update offered
	send(t, conn, message{"type": "listDevices", "requestId": "d5"})
	for _, raw := range receive(t, conn, byRequestID("d5"))["devices"].([]any) {
		if d := raw.(map[string]any); d["address"] == "000855699C4F38" && (d["availableFirmware"] != "1.6.4" || d["firmwareUpdateState"] != "READY_FOR_UPDATE") {
			t.Fatalf("firmware not offered: %v", d)
		}
	}

	send(t, conn, message{"type": "getDeviceFirmwareChangelog", "requestId": "d6", "id": file["id"]})
	if m := receive(t, conn, byRequestID("d6")); !strings.Contains(fmt.Sprint(m["changelog"]), "1.6.4") {
		t.Fatalf("unexpected changelog: %v", m)
	}
	send(t, conn, message{"type": "getDeviceFirmwareChangelog", "requestId": "d7", "id": "../etc"})
	if m := receive(t, conn, byRequestID("d7")); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}

	// Uploading a file from the computer: the session is kept now
	upload := func(content []byte) string {
		t.Helper()
		send(t, conn, message{"type": "prepareDeviceFirmwareUpload", "requestId": "p"})
		prepared := receive(t, conn, byRequestID("p"))
		resp, err := http.Post(base+prepared["url"].(string), "application/octet-stream", bytes.NewReader(content))
		if err != nil || resp.StatusCode != http.StatusNoContent {
			t.Fatalf("upload failed: %v %v", err, resp)
		}
		return prepared["id"].(string)
	}
	send(t, conn, message{"type": "addDeviceFirmware", "requestId": "d8", "id": upload([]byte("no archive")), "fileName": "x.tgz"})
	if m := receive(t, conn, byRequestID("d8")); m["code"] != "INVALID_FIRMWARE" {
		t.Fatalf("expected INVALID_FIRMWARE, got %v", m)
	}
	send(t, conn, message{"type": "addDeviceFirmware", "requestId": "d9", "id": upload(fakeccu.FirmwareArchive("HmIP-SWDO", "1.4.0")), "fileName": "hmip-swdo-1.4.0.tgz"})
	if m := receive(t, conn, byRequestID("d9")); m["success"] != true || len(m["files"].([]any)) != 2 {
		t.Fatalf("upload not added: %v", m)
	}

	send(t, conn, message{"type": "deleteDeviceFirmware", "requestId": "d10", "id": file["id"]})
	if m := receive(t, conn, byRequestID("d10")); m["success"] != true || len(m["files"].([]any)) != 1 {
		t.Fatalf("not deleted: %v", m)
	}
	send(t, conn, message{"type": "deleteDeviceFirmware", "requestId": "d11", "id": "missing"})
	if m := receive(t, conn, byRequestID("d11")); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}
}

// Notification rules: administrators save and delete them, everyone reads
// them; invalid rules are refused
func TestStackRules(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	rule := map[string]any{"name": "Fenster Bad offen", "enabled": true, "minutes": 15, "message": "Fenster Bad ist seit 15 Minuten offen",
		"conditions": []any{map[string]any{
			"channelId": 1301, "interfaceName": "HmIP-RF", "address": "003660C9930AB6:1", "datapoint": "STATE", "op": "ne", "value": 0,
		}}}
	send(t, conn, message{"type": "saveRule", "requestId": "r1", "rule": rule})
	saved := receive(t, conn, byRequestID("r1"))
	if saved["success"] != true {
		t.Fatalf("save: %v", saved)
	}
	id := saved["rule"].(map[string]any)["id"].(string)

	send(t, conn, message{"type": "getRules", "requestId": "r2"})
	list := receive(t, conn, byRequestID("r2"))["rules"].([]any)
	if len(list) != 1 || list[0].(map[string]any)["id"] != id {
		t.Fatalf("rules: %v", list)
	}

	rule["from"] = "22:00"
	send(t, conn, message{"type": "saveRule", "requestId": "r3", "rule": rule})
	if m := receive(t, conn, byRequestID("r3")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("time window without end: %v", m)
	}

	send(t, conn, message{"type": "deleteRule", "requestId": "r4", "id": id})
	if m := receive(t, conn, byRequestID("r4")); m["success"] != true {
		t.Fatalf("delete: %v", m)
	}
	send(t, conn, message{"type": "deleteRule", "requestId": "r5", "id": id})
	if m := receive(t, conn, byRequestID("r5")); m["code"] != "NOT_FOUND" {
		t.Fatalf("delete twice: %v", m)
	}
}

// The WebUI's device pictures: the list from DEVDB.tcl over the WebSocket,
// the files over HTTP next to it
func TestStackDeviceImages(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "getDeviceImages", "requestId": "i1"})
	images := receive(t, conn, byRequestID("i1"))["images"].(map[string]any)
	wrc2 := images["hmip-wrc2"].(map[string]any)
	if wrc2["path"] != "250/demo-wallswitch.png" {
		t.Fatalf("HmIP-WRC2: %v", wrc2)
	}
	shapes := wrc2["channels"].(map[string]any)["1"].([]any)
	if len(shapes) != 1 || shapes[0].(map[string]any)["kind"] != "ellipse" {
		t.Fatalf("channel 1: %v", shapes)
	}

	base := "http://" + conn.RemoteAddr().String() + "/ws/mui/img/"
	resp, err := http.Get(base + "250/demo-wallswitch.png")
	if err != nil || resp.StatusCode != http.StatusOK || resp.Header.Get("Content-Type") != "image/png" {
		t.Fatalf("picture: %v %v", resp, err)
	}
	resp.Body.Close()
	// Only the pictures, no listings, nothing outside
	for _, path := range []string{"250/", "../devdescr/DEVDB.tcl", "..%2f..%2fdevdescr%2fDEVDB.tcl"} {
		resp, err := http.Get(base + path)
		if err != nil || resp.StatusCode == http.StatusOK {
			t.Fatalf("%s: %v %v", path, resp, err)
		}
		resp.Body.Close()
	}
}

func TestStackAutoLogin(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "elevate", "password": "secret", "requestId": "e"})
	receive(t, conn, byRequestID("e"))
	dial := func() *websocket.Conn {
		c, _, err := websocket.DefaultDialer.Dial(fmt.Sprintf("ws://%s/", conn.RemoteAddr().String()), nil)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { c.Close() })
		return c
	}
	auth := func(extra message) message {
		c := dial()
		m := message{"type": "auth"}
		for k, v := range extra {
			m[k] = v
		}
		send(t, c, m)
		return receive(t, c, func(m message) bool { return m["type"] == "auth_response" })
	}
	if m := auth(nil); m["success"] == true {
		t.Fatalf("logged in without an automatic user: %v", m)
	}

	// A guest logged in automatically (UsersDefaultLogin), as the WebUI's
	// autoLoginConfig.htm sets it
	send(t, conn, message{"type": "saveUser", "requestId": "u1", "id": 0, "fullName": "Kiosk", "level": "guest", "password": "", "autoLogin": true})
	created := receive(t, conn, byRequestID("u1"))
	if created["success"] != true {
		t.Fatalf("saveUser failed: %v", created)
	}
	send(t, conn, message{"type": "getUsers", "requestId": "u2"})
	for _, raw := range receive(t, conn, byRequestID("u2"))["users"].([]any) {
		u := raw.(map[string]any)
		if (u["name"] == "Kiosk") != (u["autoLogin"] == true) {
			t.Fatalf("autoLogin not listed: %v", u)
		}
	}
	if m := auth(nil); m["success"] != true || m["user"] != "Kiosk" || m["level"] != "guest" || m["token"] == "" {
		t.Fatalf("not logged in automatically: %v", m)
	}
	// Logged out on purpose: the login page
	if m := auth(message{"noAutoLogin": true}); m["success"] == true {
		t.Fatalf("logged in automatically after logging out: %v", m)
	}

	// Made an administrator: never logged in automatically
	send(t, conn, message{"type": "saveUser", "requestId": "u3", "id": created["id"], "fullName": "Kiosk", "level": "admin", "autoLogin": true})
	if m := receive(t, conn, byRequestID("u3")); m["success"] != true {
		t.Fatalf("saveUser failed: %v", m)
	}
	if m := auth(nil); m["success"] == true {
		t.Fatalf("an administrator was logged in automatically: %v", m)
	}
}
