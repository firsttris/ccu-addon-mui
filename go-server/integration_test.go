package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

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

// receive reads messages until one matches.
func receive(t *testing.T, conn *websocket.Conn, match func(message) bool) message {
	t.Helper()
	_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	for {
		var m message
		if err := conn.ReadJSON(&m); err != nil {
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
		var m message
		if err := conn.ReadJSON(&m); err != nil {
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
	if len(channels) != 15 {
		t.Fatalf("expected all 15 channels, got %d", len(channels))
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
	if len(types) != 3 || types["0000DBE9A5C1F2"] != "HmIP-RF HmIP-SRH" || types["LEQ0000001"] != "BidCos-RF HM-LC-Sw1-FM" {
		t.Fatalf("unexpected devices: %v", types)
	}
}
