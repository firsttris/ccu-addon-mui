//go:build !lite

package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/santhosh-tekuri/jsonschema/v6"

	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/fakeccu"
)

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

func TestStackLoginReadAndControl(t *testing.T) {
	ccu, conn := startStack(t, "ccu")

	if m := call(t, conn, message{"type": "auth"}); m["code"] != "LOGIN_REQUIRED" {
		t.Fatalf("expected login to be required, got %v", m)
	}

	login := call(t, conn, message{"type": "login", "username": "Admin", "password": "secret"})
	if login["success"] != true || login["level"] != "admin" {
		t.Fatalf("unexpected login response: %v", login)
	}

	rooms := call(t, conn, message{"type": "getRooms", "deviceId": "dev-1", "requestId": "q1"})["rooms"].([]any)
	if len(rooms) != 3 || rooms[1].(map[string]any)["name"] != "Küche" {
		t.Fatalf("unexpected rooms: %v", rooms)
	}

	channels := call(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "roomId": "1", "requestId": "q2"})["channels"].([]any)
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
	description := call(t, conn, message{"type": "getParamsetDescription", "requestId": "q3", "interfaceName": "HmIP-RF", "address": "0000DBE9A5C1F2:1", "paramsetKey": "VALUES"})["description"].(map[string]any)
	state := description["STATE"].(map[string]any)
	if state["type"] != "ENUM" || len(state["valueList"].([]any)) != 3 {
		t.Fatalf("unexpected description: %v", description)
	}

	problems := call(t, conn, message{"type": "getDeviceProblems", "requestId": "q4"})["devices"].([]any)
	if len(problems) != 2 {
		t.Fatalf("unexpected device problems: %v", problems)
	}
}

func loginAs(t *testing.T, conn *websocket.Conn, user, password string) message {
	t.Helper()
	return call(t, conn, message{"type": "login", "username": user, "password": password})
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

// addonsDir is an rc.d directory with one add-on, which logs the operations
// it runs to ops.log next to it
func addonsDir(t *testing.T) string {
	dir := filepath.Join(t.TempDir(), "rc.d")
	_ = os.MkdirAll(dir, 0o755)
	script := "#!/bin/sh\ncase \"$1\" in\ninfo) echo \"Name: CUxD\"; echo \"Version: 2.11\"; echo \"Operations: restart uninstall\"; echo \"Config-Url: /addons/cuxd/\";;\nrestart|uninstall) echo \"$1\" >> " + filepath.Join(dir, "..", "ops.log") + ";;\nesac\n"
	_ = os.WriteFile(filepath.Join(dir, "cuxd"), []byte(script), 0o755)
	return dir
}
