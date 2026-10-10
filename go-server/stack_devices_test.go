//go:build !lite

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// Stack tests: operating and setting up devices and channels, rooms,
// links, pairing, tiles, heating groups (the harness is in
// integration_test.go)

// As the WebUI (setDpState): a command also goes to a device marked
// unreachable, UNREACH of HmIP battery devices is often stale
func TestStackSendsToUnreachableDevice(t *testing.T) {
	ccu, conn := startStack(t, "none")
	call(t, conn, message{"type": "auth"})

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
	call(t, conn, message{"type": "auth"})

	resp := call(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "all": true, "requestId": "q1"})
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
		raw, _ := json.Marshal(call(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "all": true, "requestId": id})["channels"])
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

	if m := call(t, conn, message{"type": "putParamset", "requestId": "q2", "interfaceName": "HmIP-RF",
		"address": "0019A0C9B3E2D1:1", "paramsetKey": "MASTER", "values": map[string]any{"CHANNEL_OPERATION_MODE": 1}}); m["success"] != true {
		t.Fatalf("putParamset failed: %v", m)
	}
	if v := ccu.Metadata("HmIP-RF", "0019A0C9B3E2D1:1", "channelMode"); fmt.Sprint(v) != "1" {
		t.Fatalf("setMetadata not called: %v", v)
	}
	if mode := modeOf("q3"); mode != 1.0 {
		t.Fatalf("expected mode 1 after saving, got %v", mode)
	}

	// Other channels get no channel mode
	call(t, conn, message{"type": "putParamset", "requestId": "q4", "interfaceName": "HmIP-RF",
		"address": "0000DBE9A5C1F2:1", "paramsetKey": "MASTER", "values": map[string]any{"EVENT_DELAY_UNIT": 1}})
	if ccu.CallCount("HmIP-RF setMetadata") != 1 {
		t.Fatalf("expected one setMetadata, got %d", ccu.CallCount("HmIP-RF setMetadata"))
	}
}

func TestStackChangeDeviceSettings(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	put := func(id string, values map[string]any) message {
		return call(t, conn, message{"type": "putParamset", "requestId": id, "interfaceName": "HmIP-RF",
			"address": "0000DBE9A5C1F2:1", "paramsetKey": "MASTER", "values": values})
	}

	if m := put("q1", map[string]any{"EVENT_DELAY_UNIT": 2}); m["success"] != true {
		t.Fatalf("putParamset failed: %v", m)
	}
	values := call(t, conn, message{"type": "getParamset", "requestId": "q2", "interfaceName": "HmIP-RF", "address": "0000DBE9A5C1F2:1", "paramsetKey": "MASTER"})["values"].(map[string]any)
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
	call(t, conn, message{"type": "auth"})

	devices := call(t, conn, message{"type": "listDevices", "requestId": "q1"})["devices"].([]any)
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

func TestStackRenameAndAssignRooms(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	if m := call(t, conn, message{"type": "rename", "requestId": "q1", "address": "LEQ0000001:1", "name": "Deckenlicht"}); m["success"] != true || m["type"] != "rename_response" {
		t.Fatalf("rename failed: %v", m)
	}
	if m := call(t, conn, message{"type": "rename", "requestId": "q2", "address": "LEQ0000001:1", "name": `Licht"; system.Exec("x`}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
	call(t, conn, message{"type": "rename", "requestId": "q3", "address": "0000DBE9A5C1F2", "name": "Griff"})

	// Move the light from the living room (1) to the kitchen (2)
	call(t, conn, message{"type": "setGroupMember", "requestId": "q4", "groupId": 2, "channelId": 101, "member": true})
	call(t, conn, message{"type": "setGroupMember", "requestId": "q5", "groupId": 1, "channelId": 101, "member": false})

	channels := call(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "roomId": "2", "requestId": "q6"})["channels"].([]any)
	var light map[string]any
	for _, raw := range channels {
		if ch := raw.(map[string]any); ch["address"] == "LEQ0000001:1" {
			light = ch
		}
	}
	if light == nil || light["name"] != "Deckenlicht" || fmt.Sprint(light["rooms"]) != "[2]" {
		t.Fatalf("unexpected channel in the kitchen: %v", light)
	}

	for _, raw := range call(t, conn, message{"type": "listDevices", "requestId": "q7"})["devices"].([]any) {
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

	interfaces := fmt.Sprint(call(t, conn, message{"type": "getInterfaces", "requestId": "q1"})["interfaces"])
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

	if m := call(t, conn, message{"type": "searchWiredDevices", "requestId": "q2"}); m["success"] != true {
		t.Fatalf("searchWiredDevices failed: %v", m)
	}
	inbox := fmt.Sprint(call(t, conn, message{"type": "getInbox", "requestId": "q3"})["devices"])
	if !strings.Contains(inbox, "HMW-LC-Sw2-DR") {
		t.Fatalf("found device not in the inbox: %s", inbox)
	}
}

func TestStackPairingInboxAndDelete(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	if m := call(t, conn, message{"type": "setInstallMode", "requestId": "q1", "interfaceName": "HmIP-RF", "on": true, "seconds": 60}); m["success"] != true {
		t.Fatalf("setInstallMode failed: %v", m)
	}
	if seconds := call(t, conn, message{"type": "getInstallMode", "requestId": "q2", "interfaceName": "HmIP-RF"})["seconds"]; seconds == nil || seconds.(float64) < 50 {
		t.Fatalf("install mode not on: %v", seconds)
	}

	inbox := call(t, conn, message{"type": "getInbox", "requestId": "q3"})["devices"].([]any)
	if len(inbox) != 1 || inbox[0].(map[string]any)["type"] != "HmIP-SWDO" {
		t.Fatalf("unexpected inbox: %v", inbox)
	}
	if m := call(t, conn, message{"type": "acceptDevice", "requestId": "q4", "address": "0008DA8A9F1234"}); m["success"] != true {
		t.Fatalf("acceptDevice failed: %v", m)
	}
	if devices := call(t, conn, message{"type": "getInbox", "requestId": "q5"})["devices"]; devices != nil {
		t.Fatalf("inbox not empty: %v", devices)
	}

	if m := call(t, conn, message{"type": "deleteDevice", "requestId": "q6", "interfaceName": "HmIP-RF", "address": "0008DA8A9F1234", "reset": true}); m["success"] != true {
		t.Fatalf("deleteDevice failed: %v", m)
	}
	for _, raw := range call(t, conn, message{"type": "listDevices", "requestId": "q7"})["devices"].([]any) {
		if raw.(map[string]any)["address"] == "0008DA8A9F1234" {
			t.Fatal("device not deleted")
		}
	}
	if ccu.CallCount("HmIP-RF deleteDevice") != 1 {
		t.Fatal("deleteDevice not called")
	}

	// Guests may not pair
	loginAs(t, conn, "Gast", "gast")
	if m := call(t, conn, message{"type": "setInstallMode", "requestId": "q8", "interfaceName": "HmIP-RF", "on": true, "seconds": 60}); m["code"] != "FORBIDDEN" {
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

	sessions := call(t, conn, message{"type": "listSessions", "requestId": "q1"})["sessions"].([]any)
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

	if m := call(t, conn, message{"type": "revokeSession", "requestId": "q2", "id": tabletID}); m["success"] != true {
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
	if m := call(t, again, message{"type": "auth", "token": tabletToken}); m["code"] != "LOGIN_REQUIRED" {
		t.Fatalf("expected the revoked token to be refused, got %v", m)
	}

	// Logging out this device revokes its token too
	if n := len(call(t, conn, message{"type": "listSessions", "requestId": "q3"})["sessions"].([]any)); n != 1 {
		t.Fatalf("expected 1 session left, got %d", n)
	}
	call(t, conn, message{"type": "logout", "requestId": "q4"})
	if m := call(t, conn, message{"type": "listSessions", "requestId": "q5"}); m["sessions"] != nil {
		t.Fatalf("expected no sessions, got %v", m)
	}
}

func TestStackDirectLinks(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	request := func(id string, m message) message {
		m["requestId"] = id
		m["interfaceName"] = "HmIP-RF"
		return call(t, conn, m)
	}

	links := request("q1", message{"type": "getLinks", "address": "00151BE9A1C2D3"})["links"].([]any)
	if len(links) != 1 || links[0].(map[string]any)["sender"] != "000855699C4F38:1" {
		t.Fatalf("unexpected links: %v", links)
	}

	if m := request("q2", message{"type": "addLink", "sender": "000855699C4F38:2", "receiver": "00151BE9A1C2D3:4", "name": "Esstisch aus"}); m["success"] != true {
		t.Fatalf("addLink failed: %v", m)
	}
	if n := len(request("q3", message{"type": "getLinks", "address": "000855699C4F38"})["links"].([]any)); n != 2 {
		t.Fatalf("expected 2 links of the button, got %d", n)
	}

	description := request("q4", message{"type": "getLinkParamsetDescription", "address": "00151BE9A1C2D3:4", "partner": "000855699C4F38:2"})["description"].(map[string]any)
	if description["SHORT_ON_LEVEL"] == nil {
		t.Fatalf("unexpected description: %v", description)
	}
	if m := request("q5", message{"type": "putLinkParamset", "address": "00151BE9A1C2D3:4", "partner": "000855699C4F38:2",
		"values": map[string]any{"SHORT_PROFILE_ACTION_TYPE": 1, "SHORT_ON_LEVEL": 0}}); m["success"] != true {
		t.Fatalf("putLinkParamset failed: %v", m)
	}
	values := request("q6", message{"type": "getLinkParamset", "address": "00151BE9A1C2D3:4", "partner": "000855699C4F38:2"})["values"].(map[string]any)
	if values["SHORT_ON_LEVEL"] != 0.0 {
		t.Fatalf("link parameter not stored: %v", values)
	}
	if m := request("q7", message{"type": "putLinkParamset", "address": "00151BE9A1C2D3:4", "partner": "000855699C4F38:2",
		"values": map[string]any{"SHORT_ON_LEVEL": 2}}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}

	if m := request("q8", message{"type": "removeLink", "sender": "000855699C4F38:1", "receiver": "00151BE9A1C2D3:4"}); m["success"] != true {
		t.Fatalf("removeLink failed: %v", m)
	}
	if n := len(request("q9", message{"type": "getLinks", "address": "00151BE9A1C2D3:4"})["links"].([]any)); n != 1 {
		t.Fatalf("expected 1 link left, got %d", n)
	}
	if ccu.CallCount("HmIP-RF addLink") != 1 || ccu.CallCount("HmIP-RF removeLink") != 1 {
		t.Fatal("link calls missing")
	}
}

func TestStackAllLinks(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	links := call(t, conn, message{"type": "getAllLinks", "requestId": "l1"})["links"].([]any)
	if len(links) != 1 {
		t.Fatalf("expected the fixture's link, got %v", links)
	}
	link := links[0].(map[string]any)
	if link["interfaceName"] != "HmIP-RF" || link["sender"] != "000855699C4F38:1" || link["name"] != "Esstisch an" {
		t.Fatalf("unexpected link: %v", link)
	}
	loginAs(t, conn, "Gast", "gast")
	if m := call(t, conn, message{"type": "getAllLinks", "requestId": "l2"}); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", m)
	}
}

func TestStackServiceMessages(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	messages := call(t, conn, message{"type": "getServiceMessages", "requestId": "q1"})["messages"].([]any)
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
	if m := call(t, conn, message{"type": "acknowledgeServiceMessage", "requestId": "q2", "id": types["STICKY_UNREACH"]}); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", m)
	}

	loginAs(t, conn, "Admin", "secret")
	if m := call(t, conn, message{"type": "acknowledgeServiceMessage", "requestId": "q3", "id": types["STICKY_UNREACH"]}); m["success"] != true {
		t.Fatalf("acknowledge failed: %v", m)
	}
	if messages := call(t, conn, message{"type": "getServiceMessages", "requestId": "q4"})["messages"].([]any); len(messages) != 2 {
		t.Fatalf("sticky message not acknowledged: %v", messages)
	}
	if m := call(t, conn, message{"type": "acknowledgeServiceMessage", "requestId": "q5", "id": 1}); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}
}

func TestStackServiceMessagesFollowEvents(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	if messages := call(t, conn, message{"type": "getServiceMessages", "requestId": "q1"})["messages"].([]any); len(messages) != 3 {
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

func TestStackFavorites(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	favorites := func(requestID string) []any {
		return call(t, conn, message{"type": "getFavorites", "requestId": requestID})["favorites"].([]any)
	}
	change := func(requestID string, m message) message {
		m["requestId"] = requestID
		return call(t, conn, m)
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
	if channels := call(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "favoriteId": "1300", "requestId": "f2"})["channels"].([]any); len(channels) != 4 {
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
	call(t, conn, message{"type": "elevate", "password": "secret", "requestId": "e"})

	if m := call(t, conn, message{"type": "setChannelTile", "requestId": "t1", "id": 101, "tile": "switch"}); m["success"] != true {
		t.Fatalf("setChannelTile failed: %v", m)
	}
	// Every channel list carries it, from mui-tiles.json
	found := false
	for _, raw := range call(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "all": true, "requestId": "t2"})["channels"].([]any) {
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
	if m := call(t, conn, message{"type": "setChannelTile", "requestId": "t3", "id": 101, "tile": "lamp"}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
}

func TestStackLayout(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	layout := `{"v":1,"layouts":{"lg":[{"i":"c:LEQ0000001:1","x":0,"y":0,"w":2}]}}`
	if m := call(t, conn, message{"type": "setLayout", "requestId": "y1", "id": 1, "layout": layout}); m["success"] != true {
		t.Fatalf("setLayout failed: %v", m)
	}
	if m := call(t, conn, message{"type": "getLayout", "requestId": "y2", "id": 1}); m["layout"] != layout {
		t.Fatalf("layout not stored: %v", m)
	}
	if m := call(t, conn, message{"type": "setLayout", "requestId": "y3", "id": 1, "layout": `[1, 2]`}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
	// Only for rooms, trades and favorite lists
	if m := call(t, conn, message{"type": "setLayout", "requestId": "y4", "id": 424242, "layout": layout}); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}
	if m := call(t, conn, message{"type": "getLayout", "requestId": "y5", "id": 424242}); m["layout"] != "" {
		t.Fatalf("expected no layout, got %v", m)
	}
}

func TestStackChannelOptions(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	call(t, conn, message{"type": "elevate", "password": "secret", "requestId": "e"})

	// A user (not admin) who may operate in general
	call(t, conn, message{"type": "saveUser", "requestId": "u", "id": 0, "fullName": "Kind", "level": "user", "password": "kind"})
	child, _, err := websocket.DefaultDialer.Dial(fmt.Sprintf("ws://%s/", conn.RemoteAddr().String()), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer child.Close()
	loginAs(t, child, "Kind", "kind")
	set := func(c *websocket.Conn, id string) message {
		return call(t, c, message{"type": "setDatapoint", "requestId": id, "interfaceName": "BidCos-RF", "address": "LEQ0000001:1", "attribute": "STATE", "value": true})
	}
	if m := set(child, "s1"); m["success"] != true {
		t.Fatalf("user could not operate: %v", m)
	}

	if m := call(t, conn, message{"type": "setChannelOption", "requestId": "o1", "id": 101, "option": "usable", "value": false}); m["success"] != true {
		t.Fatalf("setChannelOption failed: %v", m)
	}
	if m := set(child, "s2"); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN for a read-only channel, got %v", m)
	}
	if m := set(conn, "s3"); m["success"] != true {
		t.Fatalf("admin could not operate: %v", m)
	}

	call(t, conn, message{"type": "setChannelOption", "requestId": "o2", "id": 101, "option": "visible", "value": false})
	for _, ch := range call(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "requestId": "c", "all": true})["channels"].([]any) {
		if c := ch.(map[string]any); c["id"] == 101.0 && (c["hidden"] != true || c["readOnly"] != true) {
			t.Fatalf("options not listed: %v", c)
		}
	}
	if m := call(t, conn, message{"type": "setChannelOption", "requestId": "o4", "id": 101, "option": "aes", "value": true}); m["success"] != true {
		t.Fatalf("setting AES failed: %v", m)
	}
	for _, ch := range call(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "requestId": "c2", "all": true})["channels"].([]any) {
		if c := ch.(map[string]any); c["id"] == 101.0 && c["aes"] != true {
			t.Fatalf("AES not listed: %v", c)
		}
	}
	if m := call(t, conn, message{"type": "setChannelOption", "requestId": "o3", "id": 101, "option": "sticky", "value": true}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
}

func TestStackVirtualKeys(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	keys := call(t, conn, message{"type": "getVirtualKeys", "requestId": "k1"})["keys"].([]any)
	if len(keys) != 3 || keys[0].(map[string]any)["name"] != "Alles aus" {
		t.Fatalf("unexpected keys: %v", keys)
	}
	// Not among all devices
	for _, ch := range call(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "requestId": "c", "all": true})["channels"].([]any) {
		if c := ch.(map[string]any); strings.HasPrefix(c["address"].(string), "BidCoS-RF:") {
			t.Fatalf("virtual key listed among all channels: %v", c)
		}
	}
	if m := call(t, conn, message{"type": "setDatapoint", "requestId": "p", "interfaceName": "BidCos-RF", "address": "BidCoS-RF:1", "attribute": "PRESS_SHORT", "value": true}); m["success"] != true {
		t.Fatalf("pressing the virtual key failed: %v", m)
	}
	_ = ccu
}

func TestStackReplaceDevice(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	ccu.AddInboxDevice("BidCos-RF", "LEQ0000099", "HM-LC-Sw1-FM")
	loginAs(t, conn, "Admin", "secret")
	call(t, conn, message{"type": "elevate", "password": "secret", "requestId": "e"})

	devices := call(t, conn, message{"type": "listReplaceableDevices", "requestId": "r1", "interfaceName": "BidCos-RF", "address": "LEQ0000099"})["devices"].([]any)
	if len(devices) != 1 || devices[0].(map[string]any)["address"] != "LEQ0000001" {
		t.Fatalf("unexpected replaceable devices: %v", devices)
	}
	if m := call(t, conn, message{"type": "listReplaceableDevices", "requestId": "r2", "interfaceName": "HmIP-RF", "address": "0008DA8A9F1234"}); m["code"] != "NOT_SUPPORTED" {
		t.Fatalf("expected NOT_SUPPORTED for HmIP, got %v", m)
	}
	if m := call(t, conn, message{"type": "replaceDevice", "requestId": "r3", "interfaceName": "BidCos-RF", "address": "LEQ0000099", "oldAddress": "LEQ0000001"}); m["success"] != true {
		t.Fatalf("replaceDevice failed: %v", m)
	}
	// The living room light now has the new address, in its rooms as before
	found := false
	for _, ch := range call(t, conn, message{"type": "getChannels", "deviceId": "dev-1", "roomId": "1", "requestId": "c"})["channels"].([]any) {
		if c := ch.(map[string]any); c["address"] == "LEQ0000099:1" && c["name"] == "Wohnzimmer Licht" {
			found = true
		}
	}
	if !found {
		t.Fatal("the new device did not take the old one's place")
	}
	for _, d := range call(t, conn, message{"type": "getInbox", "requestId": "i"})["devices"].([]any) {
		if d.(map[string]any)["address"] == "LEQ0000099" {
			t.Fatal("the new device is still in the inbox")
		}
	}
}

func TestStackComTest(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	started := call(t, conn, message{"type": "startComTest", "requestId": "t1", "address": "LEQ0000001"})["started"].(string)
	if len(started) != 19 {
		t.Fatalf("unexpected start time %q", started)
	}
	if m := call(t, conn, message{"type": "pollComTest", "requestId": "t2", "address": "LEQ0000001", "started": started}); m["answered"] != started {
		t.Fatalf("reachable device did not answer: %v", m)
	}
	if m := call(t, conn, message{"type": "pollComTest", "requestId": "t3", "address": "LEQ0000001", "started": "now; x"}); m["code"] != "INVALID_REQUEST" {
		t.Fatalf("expected INVALID_REQUEST, got %v", m)
	}
	if m := call(t, conn, message{"type": "startComTest", "requestId": "t4", "address": "NOPE000000"}); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}
}

func TestStackHeatingGroups(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	groups := call(t, conn, message{"type": "getHeatingGroups", "requestId": "h"})["groups"].([]any)
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
	if m := call(t, guest, message{"type": "getHeatingGroups", "requestId": "g"}); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", m)
	}
}

func TestStackEditHeatingGroups(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	members := call(t, conn, message{"type": "getHeatingGroupMembers", "requestId": "h1", "groupType": "hmip.heating.group"})["members"].(map[string]any)
	if len(members["assignable"].([]any)) != 0 || members["leftover"].([]any)[0].(map[string]any)["id"] != "000A9D89A7AF25:1" {
		t.Fatalf("members: %v", members)
	}

	group := map[string]any{"id": 0, "name": "Bad & Küche", "type": "hmip.heating.group", "forbidSingleOperation": false, "members": []string{}}
	if m := call(t, conn, message{"type": "saveHeatingGroup", "requestId": "h2", "group": group}); m["code"] != "PASSWORD_REQUIRED" {
		t.Fatalf("without password: %v", m)
	}
	if m := call(t, conn, message{"type": "saveHeatingGroup", "requestId": "h3", "group": group, "password": "falsch"}); m["code"] != "INVALID_CREDENTIALS" {
		t.Fatalf("wrong password: %v", m)
	}
	saved := call(t, conn, message{"type": "saveHeatingGroup", "requestId": "h4", "group": group, "password": "secret"})
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
	if m := call(t, conn, message{"type": "saveHeatingGroup", "requestId": "h5", "group": map[string]any{"id": 1, "name": "Heizung Flur", "type": "hmip.heating.group", "members": []string{}}}); m["success"] != true {
		t.Fatalf("change: %v", m)
	}
	waitFor("member not released", func() bool { return ccu.InHeatingGroup()["000A9D89A7AF25"] == "false" })
	group["id"] = 3
	group["members"] = []string{"000A9D89A7AF25:1"}
	if m := call(t, conn, message{"type": "saveHeatingGroup", "requestId": "h6", "group": group}); m["success"] != true {
		t.Fatalf("add member: %v", m)
	}
	waitFor("member not marked", func() bool { return ccu.InHeatingGroup()["000A9D89A7AF25"] == "true" })

	groups := call(t, conn, message{"type": "getHeatingGroups", "requestId": "h7"})["groups"].([]any)
	if len(groups) != 3 {
		t.Fatalf("groups: %v", groups)
	}
	third := groups[2].(map[string]any)
	if third["name"] != "Bad & Küche" || len(third["members"].([]any)) != 1 || len(groups[0].(map[string]any)["members"].([]any)) != 0 {
		t.Errorf("after changes: %v", groups)
	}

	if m := call(t, conn, message{"type": "deleteHeatingGroup", "requestId": "h8", "id": 3}); m["success"] != true {
		t.Fatalf("delete: %v", m)
	}
	waitFor("member not released after delete", func() bool { return ccu.InHeatingGroup()["000A9D89A7AF25"] == "false" })
	if m := call(t, conn, message{"type": "deleteHeatingGroup", "requestId": "h9", "id": 3}); m["code"] != "NOT_FOUND" {
		t.Errorf("delete twice: %v", m)
	}
	if m := call(t, conn, message{"type": "saveHeatingGroup", "requestId": "h10", "group": map[string]any{"id": 0, "name": "", "type": "hmip.heating.group"}}); m["code"] != "INVALID_VALUE" {
		t.Errorf("no name: %v", m)
	}
}

// SNMP as cp_security.cgi's onSNMPSaveBtn: CCU.setSNMPEnabled with a user
// and a password of at least 8 characters; the state is snmpd-ccu3.conf
// The health of all devices: maintenance values from ReGa, and the voltage
// at which HmIP devices report LOW_BAT from their MASTER paramset
func TestStackDeviceHealth(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	m := call(t, conn, message{"type": "getDeviceHealth", "requestId": "h1"})
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

func TestStackPairingWithKeyAndSerial(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	// HmIP without the key server: SGTIN and KEY as on the label
	if m := call(t, conn, message{"type": "setInstallMode", "requestId": "p1", "interfaceName": "HmIP-RF", "on": true, "seconds": 60,
		"sgtin": "3014-F711-A000-1F98-A9B4-C2D1", "key": "00112233445566778899aabbccddeeff"}); m["success"] != true {
		t.Fatalf("whitelist: %v", m)
	}
	if len(ccu.Whitelist) != 1 || ccu.Whitelist[0]["ADDRESS"] != "3014F711A0001F98A9B4C2D1" || ccu.Whitelist[0]["KEY"] != "00112233445566778899AABBCCDDEEFF" || ccu.Whitelist[0]["KEY_MODE"] != "LOCAL" {
		t.Fatalf("whitelist: %v", ccu.Whitelist)
	}
	if m := call(t, conn, message{"type": "setInstallMode", "requestId": "p2", "interfaceName": "HmIP-RF", "on": true, "seconds": 60, "sgtin": "3014", "key": "x"}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("invalid SGTIN: %v", m)
	}
	audit, _ := os.ReadFile(auditLogs[ccu])
	if strings.Contains(string(audit), "AABBCCDDEEFF") || strings.Contains(strings.ToUpper(string(audit)), "00112233445566778899AABBCCDDEEFF") {
		t.Error("the device key is in the audit log")
	}

	// BidCos by serial number; a foreign security key needs the temporary key
	if m := call(t, conn, message{"type": "addDeviceBySerial", "requestId": "p3", "interfaceName": "BidCos-RF", "address": "leq0012345"}); m["success"] != true {
		t.Fatalf("serial: %v", m)
	}
	if m := call(t, conn, message{"type": "addDeviceBySerial", "requestId": "p4", "interfaceName": "BidCos-RF", "address": "KEQ0000001"}); m["code"] != "KEY_MISMATCH" {
		t.Fatalf("key mismatch: %v", m)
	}
	if m := call(t, conn, message{"type": "getInstallMode", "requestId": "p5", "interfaceName": "BidCos-RF"}); m["keyMismatch"] != "KEQ0000001" {
		t.Fatalf("mismatch device: %v", m)
	}
	if m := call(t, conn, message{"type": "setTempKey", "requestId": "p6", "interfaceName": "BidCos-RF", "key": "AlterSchluessel"}); m["success"] != true {
		t.Fatalf("temp key: %v", m)
	}
	if m := call(t, conn, message{"type": "addDeviceBySerial", "requestId": "p7", "interfaceName": "BidCos-RF", "address": "KEQ0000001"}); m["success"] != true {
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

// The WebUI's device pictures: the list from DEVDB.tcl over the WebSocket,
// the files over HTTP next to it
func TestStackDeviceImages(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	images := call(t, conn, message{"type": "getDeviceImages", "requestId": "i1"})["images"].(map[string]any)
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
