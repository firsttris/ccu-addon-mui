//go:build !lite

package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"ccu-addon-mui-server/pkg/fakeccu"
)

// Stack tests: the system's settings, users, backups, firmware and
// add-ons (the harness is in integration_test.go)

func TestStackAdminTokenForSettings(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	login := loginAs(t, conn, "Admin", "secret")
	if login["elevated"] != true || login["adminToken"] == nil {
		t.Fatalf("an administrator who just entered the password may set up: %v", login)
	}
	token := login["token"].(string)

	put := func(c *websocket.Conn, id string) message {
		return call(t, c, message{"type": "putParamset", "requestId": id, "interfaceName": "HmIP-RF",
			"address": "0000DBE9A5C1F2:1", "paramsetKey": "MASTER", "values": map[string]any{"EVENT_DELAY_UNIT": 1}})
	}

	// A new connection (e.g. the wall tablet next morning) with the
	// long-lived token only: operating yes, setting up no
	url := fmt.Sprintf("ws://%s/", conn.RemoteAddr().String())
	tablet, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tablet.Close()
	if m := call(t, tablet, message{"type": "auth", "token": token}); m["success"] != true || m["elevated"] != false {
		t.Fatalf("unexpected auth: %v", m)
	}
	if m := put(tablet, "q1"); m["code"] != "ELEVATION_REQUIRED" {
		t.Fatalf("expected ELEVATION_REQUIRED, got %v", m)
	}

	if m := call(t, tablet, message{"type": "elevate", "requestId": "q2", "password": "wrong"}); m["code"] != "INVALID_CREDENTIALS" {
		t.Fatalf("expected INVALID_CREDENTIALS, got %v", m)
	}
	elevate := call(t, tablet, message{"type": "elevate", "requestId": "q3", "password": "secret"})
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
	if m := call(t, again, message{"type": "auth", "token": token, "adminToken": elevate["adminToken"]}); m["elevated"] != true {
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
	if m := call(t, again, message{"type": "endElevation", "requestId": "q5"}); m["success"] != true {
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
	if m := call(t, third, message{"type": "auth", "token": token, "adminToken": elevate["adminToken"]}); m["success"] != true || m["elevated"] != false {
		t.Fatalf("expected logged in without admin rights: %v", m)
	}
}

func TestStackSystemInfo(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	info := call(t, conn, message{"type": "getSystemInfo", "requestId": "q1"})
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
	if m := call(t, conn, message{"type": "getSystemInfo", "requestId": "q2"}); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", m)
	}
}

func TestStackFirmwareUpdate(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	device := func(requestID string) map[string]any {
		for _, raw := range call(t, conn, message{"type": "listDevices", "requestId": requestID})["devices"].([]any) {
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
	if m := call(t, conn, message{"type": "installFirmware", "requestId": "q2", "interfaceName": "HmIP-RF", "address": "0008DA8A9F1234"}); m["success"] != true {
		t.Fatalf("installFirmware failed: %v", m)
	}
	if d := device("q3"); d["firmware"] != "1.2.6" || d["availableFirmware"] != nil || d["firmwareUpdateState"] != "UP_TO_DATE" {
		t.Fatalf("firmware not updated: %v", d)
	}
	// Not ready: the CCU refuses
	if m := call(t, conn, message{"type": "installFirmware", "requestId": "q4", "interfaceName": "HmIP-RF", "address": "0008DA8A9F1234"}); m["code"] != "CCU_ERROR" {
		t.Fatalf("expected CCU_ERROR, got %v", m)
	}

	// BidCos: updateFirmware transfers and installs in one go
	if m := call(t, conn, message{"type": "installFirmware", "requestId": "q5", "interfaceName": "BidCos-RF", "address": "LEQ0000001"}); m["success"] != true {
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
	if m := call(t, conn, message{"type": "installFirmware", "requestId": "r2", "interfaceName": "BidCos-RF", "address": "LEQ0000001"}); m["code"] != "UPDATE_RUNNING" {
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
	if m := call(t, conn, message{"type": "installFirmware", "requestId": "q6", "interfaceName": "BidCos-RF", "address": "LEQ0000004"}); m["code"] != "DEVICE_UNREACHABLE" {
		t.Fatalf("expected DEVICE_UNREACHABLE, got %v", m)
	}
	for _, raw := range call(t, conn, message{"type": "listDevices", "requestId": "q7"})["devices"].([]any) {
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
	if m := call(t, conn, message{"type": "createBackup", "requestId": "b1", "password": "wrong"}); m["code"] != "INVALID_CREDENTIALS" {
		t.Fatalf("expected INVALID_CREDENTIALS, got %v", m)
	}

	m := call(t, conn, message{"type": "createBackup", "requestId": "b2", "password": "secret"})
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
	if m := call(t, conn, message{"type": "createBackup", "requestId": "b1", "password": "gast"}); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", m)
	}
}

func TestStackPushSubscription(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Gast", "gast")
	endpoint := "https://push.example.com/send/abc"
	status := call(t, conn, message{"type": "getPush", "requestId": "p1", "endpoint": endpoint})
	if key, _ := status["publicKey"].(string); len(key) < 80 || status["subscribed"] != false {
		t.Fatalf("unexpected status: %v", status)
	}
	sub := message{"endpoint": endpoint, "keys": message{"p256dh": "BPKa", "auth": "c2VjcmV0"}}
	if m := call(t, conn, message{"type": "subscribePush", "requestId": "p2", "subscription": sub, "alarms": true, "service": false, "language": "en", "device": "Handy"}); m["success"] != true {
		t.Fatalf("subscribePush failed: %v", m)
	}
	if m := call(t, conn, message{"type": "getPush", "requestId": "p3", "endpoint": endpoint}); m["subscribed"] != true || m["alarms"] != true || m["service"] != false {
		t.Fatalf("not subscribed: %v", m)
	}
	// Only https push services
	sub["endpoint"] = "http://127.0.0.1/evil"
	if m := call(t, conn, message{"type": "subscribePush", "requestId": "p4", "subscription": sub, "alarms": true}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
	call(t, conn, message{"type": "unsubscribePush", "requestId": "p5", "endpoint": endpoint})
	if m := call(t, conn, message{"type": "getPush", "requestId": "p6", "endpoint": endpoint}); m["subscribed"] != false {
		t.Fatalf("still subscribed: %v", m)
	}
}

func TestStackSystemSettings(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	call(t, conn, message{"type": "elevate", "password": "secret", "requestId": "e"})

	settings := call(t, conn, message{"type": "getSystemSettings", "requestId": "s1"})
	if settings["latitude"] != 52.52 || settings["timeZoneOffset"] != 60.0 || settings["time"] == "" || settings["canPower"] != false {
		t.Fatalf("unexpected settings: %v", settings)
	}
	if m := call(t, conn, message{"type": "setLocation", "requestId": "s2", "latitude": 48.137154, "longitude": 11.576124}); m["success"] != true {
		t.Fatalf("setLocation failed: %v", m)
	}
	if m := call(t, conn, message{"type": "getSystemSettings", "requestId": "s3"}); m["latitude"] != 48.137154 || m["longitude"] != 11.576124 {
		t.Fatalf("location not stored: %v", m)
	}
	if m := call(t, conn, message{"type": "setLocation", "requestId": "s4", "latitude": 91, "longitude": 0}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
	// Not on a CCU: no reboot
	if m := call(t, conn, message{"type": "powerAction", "requestId": "s5", "action": "reboot"}); m["code"] != "NOT_SUPPORTED" {
		t.Fatalf("expected NOT_SUPPORTED, got %v", m)
	}
}

func TestStackUsers(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	call(t, conn, message{"type": "elevate", "password": "secret", "requestId": "e"})

	list := func(id string) []any {
		return call(t, conn, message{"type": "getUsers", "requestId": id})["users"].([]any)
	}
	before := len(list("u0"))

	created := call(t, conn, message{"type": "saveUser", "requestId": "u1", "id": 0, "fullName": "Anna Muster", "level": "user", "password": "geheim!1", "showLogin": true})
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
	if m := call(t, conn, message{"type": "saveUser", "requestId": "u3", "id": 0, "fullName": "AnnaMuster", "level": "guest"}); m["code"] != "EXISTS" {
		t.Fatalf("expected EXISTS, got %v", m)
	}
	// Unsafe password
	if m := call(t, conn, message{"type": "saveUser", "requestId": "u4", "id": created["id"], "fullName": "Anna Muster", "level": "user", "password": "x^y"}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
	// The own account keeps its rights
	var adminID any
	for _, u := range users {
		if u.(map[string]any)["name"] == "Admin" {
			adminID = u.(map[string]any)["id"]
		}
	}
	if m := call(t, conn, message{"type": "saveUser", "requestId": "u5", "id": adminID, "fullName": "Admin", "level": "guest"}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
	if m := call(t, conn, message{"type": "deleteUser", "requestId": "u6", "id": adminID}); m["success"] == true {
		t.Fatalf("deleted the own account: %v", m)
	}

	if m := call(t, conn, message{"type": "deleteUser", "requestId": "u7", "id": created["id"]}); m["success"] != true {
		t.Fatalf("deleteUser failed: %v", m)
	}
	if len(list("u8")) != before {
		t.Fatal("user not deleted")
	}
}

func TestStackAddons(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	call(t, conn, message{"type": "elevate", "password": "secret", "requestId": "e"})

	list := call(t, conn, message{"type": "getAddons", "requestId": "a1", "language": "de"})["addons"].([]any)
	if len(list) != 1 {
		t.Fatalf("unexpected add-ons: %v", list)
	}
	if a := list[0].(map[string]any); a["name"] != "CUxD" || a["version"] != "2.11" || a["configUrl"] != "/addons/cuxd/" {
		t.Fatalf("unexpected add-on: %v", a)
	}
	if m := call(t, conn, message{"type": "addonAction", "requestId": "a2", "id": "cuxd", "operation": "restart"}); m["success"] != true {
		t.Fatalf("restart failed: %v", m)
	}
	if m := call(t, conn, message{"type": "addonAction", "requestId": "a3", "id": "../../bin/sh", "operation": "restart"}); m["success"] == true {
		t.Fatalf("ran a path: %v", m)
	}
	if m := call(t, conn, message{"type": "addonAction", "requestId": "a4", "id": "cuxd", "operation": "uninstall"}); m["success"] != true {
		t.Fatalf("uninstall failed: %v", m)
	}
	if list := call(t, conn, message{"type": "getAddons", "requestId": "a5"})["addons"].([]any); len(list) != 0 {
		t.Fatalf("add-on still listed: %v", list)
	}
}

func TestStackChangePassword(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	call(t, conn, message{"type": "elevate", "password": "secret", "requestId": "e"})
	call(t, conn, message{"type": "saveUser", "requestId": "u2", "id": 0, "fullName": "Kind", "level": "user", "password": "alt1"})

	child, _, err := websocket.DefaultDialer.Dial(fmt.Sprintf("ws://%s/", conn.RemoteAddr().String()), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer child.Close()
	loginAs(t, child, "Kind", "alt1")
	if m := call(t, child, message{"type": "changePassword", "requestId": "p1", "currentPassword": "falsch", "newPassword": "neu2"}); m["code"] != "INVALID_CREDENTIALS" {
		t.Fatalf("expected INVALID_CREDENTIALS, got %v", m)
	}
	if m := call(t, child, message{"type": "changePassword", "requestId": "p2", "currentPassword": "alt1", "newPassword": "x^y"}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
	if m := call(t, child, message{"type": "changePassword", "requestId": "p3", "currentPassword": "alt1", "newPassword": "neu2"}); m["success"] != true {
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
	if m := call(t, guest, message{"type": "changePassword", "requestId": "p4", "currentPassword": "gast", "newPassword": "neu"}); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", m)
	}
}

func TestStackLogging(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	if m := call(t, conn, message{"type": "getLogging", "requestId": "l1"}); m["rfd"] != 2.0 || m["rega"] != 2.0 || m["hmip"] != "ERROR" || m["host"] != "" {
		t.Fatalf("unexpected logging settings: %v", m)
	}
	if m := call(t, conn, message{"type": "setLogging", "requestId": "l3", "host": "10.0.0.5", "rfd": 1, "hmip": "INFO", "rega": 0}); m["success"] != true {
		t.Fatalf("setLogging failed: %v", m)
	}
	if m := call(t, conn, message{"type": "getLogging", "requestId": "l4"}); m["rfd"] != 1.0 || m["rega"] != 0.0 || m["hmip"] != "INFO" || m["host"] != "10.0.0.5" {
		t.Fatalf("settings not saved: %v", m)
	}
	if ccu.CallCount("BidCos-RF logLevel") < 2 {
		t.Fatal("the rfd log level was not set")
	}
	if m := call(t, conn, message{"type": "setLogging", "requestId": "l5", "host": "a b", "rfd": 3, "hmip": "INFO", "rega": 0}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}

	download := call(t, conn, message{"type": "downloadLogs", "requestId": "d"})
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

func TestStackClock(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	settings := func(id string) message {
		return call(t, conn, message{"type": "getSystemSettings", "requestId": id})
	}
	m := settings("g1")
	if m["timeServers"] != "pool.ntp.org" || m["timeZone"] != "CET/CEST" || m["canSetClock"] != false {
		t.Fatalf("unexpected clock settings: %v", m)
	}
	if zones, _ := m["timeZones"].([]any); len(zones) < 28 {
		t.Fatalf("expected the WebUI's time zones, got %v", m["timeZones"])
	}

	if r := call(t, conn, message{"type": "setTimeServers", "requestId": "n1", "servers": " ptbtime1.ptb.de   fritz.box "}); r["success"] != true {
		t.Fatalf("setTimeServers failed: %v", r)
	}
	if r := call(t, conn, message{"type": "setTimeZone", "requestId": "z1", "timeZone": "GMT/BST"}); r["success"] != true {
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
		if r := call(t, conn, bad); r["code"] != "INVALID_VALUE" {
			t.Fatalf("expected INVALID_VALUE for %v, got %v", bad, r)
		}
	}
	// Not on a CCU: the clock is not set by hand
	if r := call(t, conn, message{"type": "setClock", "requestId": "c1", "time": "2026-10-04 12:30:00"}); r["code"] != "NOT_SUPPORTED" {
		t.Fatalf("expected NOT_SUPPORTED, got %v", r)
	}
}

func TestStackRestoreBackup(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	base := fmt.Sprintf("http://127.0.0.1:%d", wsPorts[ccu])

	upload := func(content string) string {
		t.Helper()
		prepared := call(t, conn, message{"type": "prepareRestore", "requestId": "p"})
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
	request := func(m message) message {
		t.Helper()
		m["requestId"] = "r"
		return call(t, conn, m)
	}

	// Not a backup
	id := upload("holiday photos")
	if m := request(message{"type": "checkRestore", "id": id, "password": "secret"}); m["code"] != "INVALID_BACKUP" {
		t.Fatalf("expected INVALID_BACKUP, got %v", m)
	}
	// Wrong password
	if m := request(message{"type": "checkRestore", "id": id, "password": "falsch"}); m["code"] != "INVALID_CREDENTIALS" {
		t.Fatalf("expected INVALID_CREDENTIALS, got %v", m)
	}
	// From a newer firmware
	id = upload(fakeccu.FakeBackup + " " + fakeccu.FakeBackupNewer)
	if m := request(message{"type": "restoreBackup", "id": id, "password": "secret"}); m["code"] != "FIRMWARE_TOO_OLD" {
		t.Fatalf("expected FIRMWARE_TOO_OLD, got %v", m)
	}
	// With a security key
	keyed := fakeccu.FakeBackup + " " + fakeccu.FakeBackupKeyed
	id = upload(keyed)
	if m := request(message{"type": "checkRestore", "id": id, "password": "secret"}); m["success"] != true || m["needsKey"] != true {
		t.Fatalf("expected a key to be needed, got %v", m)
	}
	if m := request(message{"type": "restoreBackup", "id": id, "password": "secret", "key": "falsch"}); m["code"] != "WRONG_KEY" {
		t.Fatalf("expected WRONG_KEY, got %v", m)
	}
	if _, rebooted := ccu.RestoredBackup(); rebooted {
		t.Fatal("nothing may be restored with a wrong key")
	}
	if m := request(message{"type": "restoreBackup", "id": id, "password": "secret", "key": fakeccu.FakeBackupKey}); m["success"] != true {
		t.Fatalf("restoreBackup failed: %v", m)
	}
	if restored, rebooted := ccu.RestoredBackup(); restored != keyed || !rebooted {
		t.Fatalf("backup not restored: %q %v", restored, rebooted)
	}
	// The upload is gone afterwards
	if m := request(message{"type": "restoreBackup", "id": id, "password": "secret"}); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}
	// A plain backup needs no key
	id = upload(fakeccu.FakeBackup)
	if m := request(message{"type": "checkRestore", "id": id, "password": "secret"}); m["needsKey"] != false {
		t.Fatalf("expected no key, got %v", m)
	}
}

func TestStackCcuFirmware(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	base := fmt.Sprintf("http://127.0.0.1:%d", wsPorts[ccu])

	upload := func(content string) string {
		t.Helper()
		prepared := call(t, conn, message{"type": "prepareCcuFirmware", "requestId": "p"})
		resp, err := http.Post(base+prepared["url"].(string), "application/octet-stream", strings.NewReader(content))
		if err != nil || resp.StatusCode != http.StatusNoContent {
			t.Fatalf("upload failed: %v %v", err, resp)
		}
		return prepared["id"].(string)
	}
	request := func(m message) message {
		t.Helper()
		m["requestId"] = "r"
		return call(t, conn, m)
	}

	if m := request(message{"type": "checkCcuFirmware", "id": upload("holiday photos"), "password": "secret"}); m["code"] != "INVALID_FIRMWARE" {
		t.Fatalf("expected INVALID_FIRMWARE, got %v", m)
	}
	// Checked, then cancelled: nothing installed
	if m := request(message{"type": "checkCcuFirmware", "id": upload(fakeccu.FakeFirmware), "password": "secret"}); m["success"] != true || m["eula"] != nil {
		t.Fatalf("checkCcuFirmware failed: %v", m)
	}
	request(message{"type": "cancelCcuFirmware", "password": "secret"})
	if m := request(message{"type": "installCcuFirmware", "password": "secret"}); m["success"] != true || ccu.InstalledFirmware() != "" {
		t.Fatalf("a cancelled update must not be installed: %v %q", m, ccu.InstalledFirmware())
	}
	// With a licence text, installed
	firmware := fakeccu.FakeFirmware + " " + fakeccu.FakeFirmwareEula
	id := upload(firmware)
	if m := request(message{"type": "checkCcuFirmware", "id": id, "password": "secret", "language": "de"}); m["eula"] != "Lizenzbedingungen der Fake-Firmware" {
		t.Fatalf("expected the licence text, got %v", m)
	}
	// The CCU has the file now
	if m := request(message{"type": "checkCcuFirmware", "id": id, "password": "secret"}); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}
	if m := request(message{"type": "installCcuFirmware", "password": "falsch"}); m["code"] != "INVALID_CREDENTIALS" {
		t.Fatalf("expected INVALID_CREDENTIALS, got %v", m)
	}
	if m := request(message{"type": "installCcuFirmware", "password": "secret"}); m["success"] != true || ccu.InstalledFirmware() != firmware {
		t.Fatalf("firmware not installed: %v %q", m, ccu.InstalledFirmware())
	}
}

func TestStackInstallAddon(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	base := fmt.Sprintf("http://127.0.0.1:%d", wsPorts[ccu])

	install := func(content string) message {
		t.Helper()
		prepared := call(t, conn, message{"type": "prepareAddonUpload", "requestId": "p"})
		resp, err := http.Post(base+prepared["url"].(string), "application/octet-stream", strings.NewReader(content))
		if err != nil || resp.StatusCode != http.StatusNoContent {
			t.Fatalf("upload failed: %v %v", err, resp)
		}
		return call(t, conn, message{"type": "installAddon", "requestId": "i", "id": prepared["id"], "password": "secret"})
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

func TestStackGeneralSettings(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	m := call(t, conn, message{"type": "getGeneralSettings", "requestId": "g1"})
	price := m["energyPrice"].(map[string]any)
	if price["currency"] != "EUR" || price["electricity"] != 0.0 || m["infoLed"].(map[string]any)["service"] != true ||
		m["hideStickyUnreach"] != false || len(m["currencies"].([]any)) != 5 || m["storage"].(map[string]any)["total"].(float64) <= 0 {
		t.Fatalf("settings: %v", m)
	}

	stickyBefore := false
	for _, item := range call(t, conn, message{"type": "getServiceMessages", "requestId": "g2"})["messages"].([]any) {
		stickyBefore = stickyBefore || item.(map[string]any)["type"] == "STICKY_UNREACH"
	}

	if m := call(t, conn, message{"type": "setGeneralSettings", "requestId": "g3",
		"energyPrice":       map[string]any{"currency": "EUR", "electricity": 0.32, "gas": 0.11, "gasHeatingValue": 11.3, "gasConditionNumber": 0.95},
		"infoLed":           map[string]any{"service": false, "alarm": true},
		"hideStickyUnreach": true, "betaFirmware": false}); m["success"] != true {
		t.Fatalf("set: %v", m)
	}
	m = call(t, conn, message{"type": "getGeneralSettings", "requestId": "g4"})
	if m["energyPrice"].(map[string]any)["electricity"] != 0.32 || m["infoLed"].(map[string]any)["service"] != false || m["hideStickyUnreach"] != true {
		t.Errorf("after set: %v", m)
	}

	// Messages of devices that were unreachable are hidden and acknowledged
	sticky := func(id string) bool {
		for _, item := range call(t, conn, message{"type": "getServiceMessages", "requestId": id})["messages"].([]any) {
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
	call(t, conn, message{"type": "setGeneralSettings", "requestId": "g5b",
		"energyPrice": map[string]any{"currency": "EUR", "electricity": 0.32, "gas": 0.11, "gasHeatingValue": 11.3, "gasConditionNumber": 0.95},
		"infoLed":     map[string]any{"service": false, "alarm": true}, "hideStickyUnreach": false})
	deadline := time.Now().Add(3 * time.Second)
	for i := 0; sticky(fmt.Sprintf("g5c%d", i)); i++ {
		if time.Now().After(deadline) {
			t.Fatal("sticky unreach not acknowledged")
		}
		time.Sleep(50 * time.Millisecond)
	}

	// The prices come with the diagrams
	if m := call(t, conn, message{"type": "getDiagrams", "requestId": "g6"}); m["energyPrice"].(map[string]any)["electricity"] != 0.32 {
		t.Errorf("diagrams: %v", m)
	}

	if m := call(t, conn, message{"type": "setGeneralSettings", "requestId": "g7", "energyPrice": map[string]any{"currency": "USD"}}); m["code"] != "INVALID_VALUE" {
		t.Errorf("invalid currency: %v", m)
	}
}

func TestStackSecurity(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	if m := call(t, conn, message{"type": "getSecurity", "requestId": "s1"}); m["ssh"] != false || m["auth"] != false || m["httpsRedirect"] != false || m["sessionTimeout"] != 300.0 {
		t.Fatalf("security: %v", m)
	}
	// The session timeout is written to rega.conf (no WebUI session needed)
	if m := call(t, conn, message{"type": "setSessionTimeout", "requestId": "t1", "seconds": 100}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("too short: %v", m)
	}
	if m := call(t, conn, message{"type": "setSessionTimeout", "requestId": "t2", "seconds": 420}); m["success"] != true {
		t.Fatalf("timeout: %v", m)
	}
	if data, _ := os.ReadFile(filepath.Join(ccu.ConfigDir, "rega.conf")); !strings.Contains(string(data), "SessionTimeout=420") {
		t.Fatalf("rega.conf: %s", data)
	}
	change := message{"type": "setSecurity", "requestId": "s2", "ssh": true, "sshPassword": "geheim123", "auth": true, "httpsRedirect": false}
	if m := call(t, conn, change); m["code"] != "PASSWORD_REQUIRED" {
		t.Fatalf("without password: %v", m)
	}
	change["requestId"] = "s3"
	change["password"] = "secret"
	if m := call(t, conn, change); m["success"] != true {
		t.Fatalf("set: %v", m)
	}
	if m := call(t, conn, message{"type": "getSecurity", "requestId": "s4"}); m["ssh"] != true || m["auth"] != true || m["httpsRedirect"] != false {
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
	if m := call(t, conn, message{"type": "changeSecurityKey", "requestId": "s5", "key": "kurz"}); m["code"] != "INVALID_VALUE" {
		t.Errorf("short key: %v", m)
	}
	if m := call(t, conn, message{"type": "changeSecurityKey", "requestId": "s6", "key": "Neuer_Schluessel1"}); m["success"] != true || ccu.SecurityKey != "Neuer_Schluessel1" {
		t.Errorf("key: %v %q", m, ccu.SecurityKey)
	}
	if m := call(t, conn, message{"type": "changeSecurityKey", "requestId": "s7", "key": "Neuer_Schluessel1"}); m["code"] != "KEY_SAME" {
		t.Errorf("same key: %v", m)
	}
	// Neither the key nor the SSH password are in the audit log
	data, _ := os.ReadFile(auditLogs[ccu])
	if strings.Contains(string(data), "Neuer_Schluessel1") || strings.Contains(string(data), "geheim123") {
		t.Errorf("secret in the audit log: %s", data)
	}
}

func TestStackSNMP(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	if m := call(t, conn, message{"type": "getSecurity", "requestId": "n1"}); m["snmp"] != false {
		t.Fatalf("snmp on at start: %v", m)
	}
	if m := call(t, conn, message{"type": "setSnmp", "requestId": "n2", "snmp": true, "snmpUser": "monitor", "snmpPassword": "kurz", "password": "secret"}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("short password: %v", m)
	}
	if m := call(t, conn, message{"type": "setSnmp", "requestId": "n3", "snmp": true, "snmpUser": "monitor", "snmpPassword": "Snmp-Geheim9", "password": "secret"}); m["success"] != true || ccu.SNMPUser != "monitor" {
		t.Fatalf("enable: %v %q", m, ccu.SNMPUser)
	}
	if m := call(t, conn, message{"type": "getSecurity", "requestId": "n4"}); m["snmp"] != true {
		t.Fatalf("snmp off after enabling: %v", m)
	}
	if m := call(t, conn, message{"type": "setSnmp", "requestId": "n5", "snmp": false}); m["success"] != true || ccu.SNMPUser != "" {
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
	m := call(t, conn, message{"type": "getNetwork", "requestId": "n1"})
	config := m["config"].(map[string]any)
	if config["dhcp"] != true || config["hostname"] != "homematic-ccu3" || m["tailscale"].(map[string]any)["available"] != false {
		t.Fatalf("network: %v", m)
	}
	manual := map[string]any{"dhcp": false, "hostname": "ccu-keller", "ip": "192.168.178.30", "netmask": "255.255.255.0", "gateway": "192.168.178.1", "dns1": "192.168.178.1", "dns2": ""}
	if m := call(t, conn, message{"type": "setNetwork", "requestId": "n2", "config": manual}); m["success"] != true {
		t.Fatalf("set: %v", m)
	}
	if c := call(t, conn, message{"type": "getNetwork", "requestId": "n3"})["config"].(map[string]any); c["dhcp"] != false || c["ip"] != "192.168.178.30" || c["hostname"] != "ccu-keller" {
		t.Errorf("after set: %v", c)
	}
	manual["gateway"] = "10.0.0.1"
	if m := call(t, conn, message{"type": "setNetwork", "requestId": "n4", "config": manual}); m["code"] != "INVALID_VALUE" {
		t.Errorf("gateway outside: %v", m)
	}
}

func TestStackFirewall(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	fw := call(t, conn, message{"type": "getFirewall", "requestId": "f1"})["firewall"].(map[string]any)
	if fw["mode"] != "RESTRICTIVE" || len(fw["ips"].([]any)) != 2 || len(fw["services"].([]any)) != 4 {
		t.Fatalf("firewall: %v", fw)
	}
	next := map[string]any{
		"mode": "RESTRICTIVE", "ips": []string{"192.168.178.0/24"}, "userPorts": []string{"1883"},
		"services": []map[string]any{{"id": "XMLRPC", "ports": []int{}, "access": "full"}, {"id": "REGA", "ports": []int{}, "access": "restricted"}, {"id": "NEOSERVER", "ports": []int{}, "access": "none"}},
	}
	if m := call(t, conn, message{"type": "setFirewall", "requestId": "f2", "firewall": next}); m["code"] != "PASSWORD_REQUIRED" {
		t.Fatalf("without password: %v", m)
	}
	if m := call(t, conn, message{"type": "setFirewall", "requestId": "f3", "firewall": next, "password": "secret"}); m["success"] != true || ccu.CallCount("JSON Firewall.setConfiguration") != 1 {
		t.Fatalf("set: %v", m)
	}
	fw = call(t, conn, message{"type": "getFirewall", "requestId": "f4"})["firewall"].(map[string]any)
	if fw["ips"].([]any)[0] != "192.168.178.0/24" || fw["userPorts"].([]any)[0] != "1883" {
		t.Errorf("after set: %v", fw)
	}
	for _, s := range fw["services"].([]any) {
		if s := s.(map[string]any); s["id"] == "XMLRPC" && s["access"] != "full" {
			t.Errorf("xmlrpc: %v", s)
		}
	}
	next["ips"] = []string{"192.168.178"}
	if m := call(t, conn, message{"type": "setFirewall", "requestId": "f5", "firewall": next}); m["code"] != "INVALID_VALUE" {
		t.Errorf("invalid address: %v", m)
	}
}

func TestStackLanGateways(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	m := call(t, conn, message{"type": "getLanGateways", "requestId": "g1"})
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
	if m := call(t, conn, message{"type": "setLanGateways", "requestId": "g2", "gateways": next}); m["code"] != "PASSWORD_REQUIRED" {
		t.Fatalf("without password: %v", m)
	}
	if m := call(t, conn, message{"type": "setLanGateways", "requestId": "g3", "gateways": next, "password": "secret"}); m["success"] != true || ccu.CallCount("JSON BidCoS_Wired.setConfigurationWired") != 1 {
		t.Fatalf("set: %v", m)
	}
	gateways = call(t, conn, message{"type": "getLanGateways", "requestId": "g4"})["gateways"].([]any)
	if len(gateways) != 2 || gateways[1].(map[string]any)["state"] != "inactive" {
		t.Fatalf("after set: %v", gateways)
	}
	// The kept session needs no password now
	if m := call(t, conn, message{"type": "changeLanGatewayKey", "requestId": "g5", "serial": "NEQ0987654", "key": "Neu#1"}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("forbidden character: %v", m)
	}
	if m := call(t, conn, message{"type": "changeLanGatewayKey", "requestId": "g6", "serial": "NEQ0987654", "key": "NeuerKey2"}); m["success"] != true {
		t.Fatalf("change key: %v", m)
	}
	if data, _ := os.ReadFile(filepath.Join(ccu.ConfigDir, "NEQ0987654.keychange")); !strings.Contains(string(data), "KEY=NeuerKey2") || !strings.Contains(string(data), "CURKEY=KellerKey1") {
		t.Errorf("keychange: %s", data)
	}
	if m := call(t, conn, message{"type": "setBidcosInterface", "requestId": "g7", "address": "LEQ0000001", "module": "NEQ0987654", "roaming": false}); m["success"] != true {
		t.Fatalf("assign: %v", m)
	}
	if m := call(t, conn, message{"type": "setBidcosInterface", "requestId": "g8", "address": "LEQ0000001", "module": "XYZ", "roaming": false}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("unknown module: %v", m)
	}
	for _, d := range call(t, conn, message{"type": "listDevices", "requestId": "g9"})["devices"].([]any) {
		if d := d.(map[string]any); d["address"] == "LEQ0000001" && d["interface"] != "NEQ0987654" {
			t.Errorf("assigned device: %v", d)
		}
	}
}

func TestStackFactoryReset(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	ccu.SecurityKey = "Schluessel1"
	loginAs(t, conn, "Admin", "secret")
	if m := call(t, conn, message{"type": "factoryReset", "requestId": "r1"}); m["code"] != "PASSWORD_REQUIRED" {
		t.Fatalf("without password: %v", m)
	}
	if m := call(t, conn, message{"type": "factoryReset", "requestId": "r2", "password": "secret"}); m["code"] != "KEY_REQUIRED" {
		t.Fatalf("without key: %v", m)
	}
	// The WebUI session from r2 is kept, but the reset asks for the
	// password every time
	if m := call(t, conn, message{"type": "factoryReset", "requestId": "r2b", "key": "Schluessel1"}); m["code"] != "PASSWORD_REQUIRED" {
		t.Fatalf("reset without the password again: %v", m)
	}
	if m := call(t, conn, message{"type": "factoryReset", "requestId": "r3", "key": "falsch", "password": "secret"}); m["code"] != "KEY_WRONG" {
		t.Fatalf("wrong key: %v", m)
	}
	if ccu.FactoryResetDone() {
		t.Fatal("reset with a wrong key")
	}
	if m := call(t, conn, message{"type": "factoryReset", "requestId": "r4", "key": "Schluessel1", "password": "secret"}); m["success"] != true {
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
		return fmt.Sprint(call(t, conn, message{"type": "getSecurity", "requestId": id})["securityLevel"])
	}
	// The fixture's firewall restricts two services and leaves one open
	if got := level("l1"); got != "CUSTOM" {
		t.Fatalf("level: %s", got)
	}
	if m := call(t, conn, message{"type": "setSecurityLevel", "requestId": "l2", "level": "HIGH", "password": "secret"}); m["success"] != true {
		t.Fatalf("set: %v", m)
	}
	if got := level("l3"); got != "HIGH" {
		t.Fatalf("after HIGH: %s", got)
	}
	if m := call(t, conn, message{"type": "setSecurityLevel", "requestId": "l4", "level": "LOW"}); m["success"] != true {
		t.Fatalf("set: %v", m)
	}
	if got := level("l5"); got != "LOW" {
		t.Fatalf("after LOW: %s", got)
	}
	if fw := call(t, conn, message{"type": "getFirewall", "requestId": "l6"})["firewall"].(map[string]any); fw["mode"] != "MOST_OPEN" || len(fw["ips"].([]any)) != 2 {
		t.Errorf("firewall: %v", fw)
	}
	if m := call(t, conn, message{"type": "setSecurityLevel", "requestId": "l7", "level": "SUPER"}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("unknown level: %v", m)
	}
	_ = ccu
}

func TestStackDeviceFirmware(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	base := fmt.Sprintf("http://127.0.0.1:%d", wsPorts[ccu])

	if files := call(t, conn, message{"type": "getDeviceFirmware", "requestId": "d1"})["files"].([]any); len(files) != 0 {
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
	if m := call(t, conn, message{"type": "downloadDeviceFirmware", "requestId": "d3", "deviceType": "HmIP-WRC2"}); m["code"] != "PASSWORD_REQUIRED" {
		t.Fatalf("expected PASSWORD_REQUIRED, got %v", m)
	}
	m := call(t, conn, message{"type": "downloadDeviceFirmware", "requestId": "d4", "deviceType": "HmIP-WRC2", "password": "secret"})
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
	for _, raw := range call(t, conn, message{"type": "listDevices", "requestId": "d5"})["devices"].([]any) {
		if d := raw.(map[string]any); d["address"] == "000855699C4F38" && (d["availableFirmware"] != "1.6.4" || d["firmwareUpdateState"] != "READY_FOR_UPDATE") {
			t.Fatalf("firmware not offered: %v", d)
		}
	}

	if m := call(t, conn, message{"type": "getDeviceFirmwareChangelog", "requestId": "d6", "id": file["id"]}); !strings.Contains(fmt.Sprint(m["changelog"]), "1.6.4") {
		t.Fatalf("unexpected changelog: %v", m)
	}
	if m := call(t, conn, message{"type": "getDeviceFirmwareChangelog", "requestId": "d7", "id": "../etc"}); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}

	// Uploading a file from the computer: the session is kept now
	upload := func(content []byte) string {
		t.Helper()
		prepared := call(t, conn, message{"type": "prepareDeviceFirmwareUpload", "requestId": "p"})
		resp, err := http.Post(base+prepared["url"].(string), "application/octet-stream", bytes.NewReader(content))
		if err != nil || resp.StatusCode != http.StatusNoContent {
			t.Fatalf("upload failed: %v %v", err, resp)
		}
		return prepared["id"].(string)
	}
	if m := call(t, conn, message{"type": "addDeviceFirmware", "requestId": "d8", "id": upload([]byte("no archive")), "fileName": "x.tgz"}); m["code"] != "INVALID_FIRMWARE" {
		t.Fatalf("expected INVALID_FIRMWARE, got %v", m)
	}
	if m := call(t, conn, message{"type": "addDeviceFirmware", "requestId": "d9", "id": upload(fakeccu.FirmwareArchive("HmIP-SWDO", "1.4.0")), "fileName": "hmip-swdo-1.4.0.tgz"}); m["success"] != true || len(m["files"].([]any)) != 2 {
		t.Fatalf("upload not added: %v", m)
	}

	if m := call(t, conn, message{"type": "deleteDeviceFirmware", "requestId": "d10", "id": file["id"]}); m["success"] != true || len(m["files"].([]any)) != 1 {
		t.Fatalf("not deleted: %v", m)
	}
	if m := call(t, conn, message{"type": "deleteDeviceFirmware", "requestId": "d11", "id": "missing"}); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}
}

func TestStackAutoLogin(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	call(t, conn, message{"type": "elevate", "password": "secret", "requestId": "e"})
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
		return receive(t, c, isAuthResponse)
	}
	if m := auth(nil); m["success"] == true {
		t.Fatalf("logged in without an automatic user: %v", m)
	}

	// A guest logged in automatically (UsersDefaultLogin), as the WebUI's
	// autoLoginConfig.htm sets it
	created := call(t, conn, message{"type": "saveUser", "requestId": "u1", "id": 0, "fullName": "Kiosk", "level": "guest", "password": "", "autoLogin": true})
	if created["success"] != true {
		t.Fatalf("saveUser failed: %v", created)
	}
	for _, raw := range call(t, conn, message{"type": "getUsers", "requestId": "u2"})["users"].([]any) {
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
	if m := call(t, conn, message{"type": "saveUser", "requestId": "u3", "id": created["id"], "fullName": "Kiosk", "level": "admin", "autoLogin": true}); m["success"] != true {
		t.Fatalf("saveUser failed: %v", m)
	}
	if m := auth(nil); m["success"] == true {
		t.Fatalf("an administrator was logged in automatically: %v", m)
	}
}
