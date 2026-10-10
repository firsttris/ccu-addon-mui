//go:build !lite

package main

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// Stack tests: programs, system variables, alarms, scripts, rules,
// diagrams and the system protocol (the harness is in integration_test.go)

// System variables send no events: the server reads them for the
// connections that loaded them and sends them when they change
func TestStackSysvarChangesArePushed(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	call(t, conn, message{"type": "getSysvars", "requestId": "q1"})

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

	sysvars := call(t, conn, message{"type": "getSysvars", "requestId": "q1"})["sysvars"].([]any)
	if len(sysvars) != 7 {
		t.Fatalf("unexpected sysvars: %v", sysvars)
	}
	mode := sysvars[2].(map[string]any)
	if mode["kind"] != "enum" || mode["value"] != 1.0 || len(mode["valueList"].([]any)) != 3 {
		t.Fatalf("unexpected mode: %v", mode)
	}

	if m := call(t, conn, message{"type": "setSysvar", "requestId": "q2", "id": 952, "value": 2}); m["success"] != true {
		t.Fatalf("setSysvar failed: %v", m)
	}
	if m := call(t, conn, message{"type": "setSysvar", "requestId": "q3", "id": 953, "value": `x"); system.Exec("y`}); m["code"] != "CCU_ERROR" {
		t.Fatalf("expected the injection to be refused, got %v", m)
	}
	if v := call(t, conn, message{"type": "getSysvars", "requestId": "q4"})["sysvars"].([]any)[2].(map[string]any)["value"]; v != 2.0 {
		t.Fatalf("sysvar not set: %v", v)
	}

	programs := call(t, conn, message{"type": "getPrograms", "requestId": "q5"})["programs"].([]any)
	if len(programs) != 4 || programs[3].(map[string]any)["internal"] != true || programs[0].(map[string]any)["internal"] != nil {
		t.Fatalf("unexpected programs: %v", programs)
	}
	call(t, conn, message{"type": "runProgram", "requestId": "q6", "id": 1200})
	if ccu.ProgramRuns(1200) != 1 {
		t.Fatal("program not run")
	}
	if m := call(t, conn, message{"type": "setProgramActive", "requestId": "q7", "id": 1202, "active": true}); m["success"] != true {
		t.Fatalf("setProgramActive failed: %v", m)
	}

	// Guests may look, not act
	loginAs(t, conn, "Gast", "gast")
	if m := call(t, conn, message{"type": "runProgram", "requestId": "q8", "id": 1200}); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", m)
	}
}

func TestStackCreateRenameDeleteRoomsAndSysvars(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	created := call(t, conn, message{"type": "createGroup", "requestId": "q1", "list": "rooms", "name": "Garage"})
	id, ok := created["id"].(float64)
	if created["success"] != true || !ok {
		t.Fatalf("createGroup failed: %v", created)
	}
	if m := call(t, conn, message{"type": "renameGroup", "requestId": "q2", "list": "rooms", "id": id, "name": "Carport"}); m["success"] != true {
		t.Fatalf("renameGroup failed: %v", m)
	}
	if rooms := fmt.Sprint(call(t, conn, message{"type": "getRooms", "requestId": "q3", "deviceId": "test"})["rooms"]); !strings.Contains(rooms, "Carport") {
		t.Fatalf("room not renamed: %v", rooms)
	}
	// A room id from the other list is not found
	if m := call(t, conn, message{"type": "deleteGroup", "requestId": "q4", "list": "trades", "id": id}); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}
	if m := call(t, conn, message{"type": "deleteGroup", "requestId": "q5", "list": "rooms", "id": id}); m["success"] != true {
		t.Fatalf("deleteGroup failed: %v", m)
	}
	if m := call(t, conn, message{"type": "createGroup", "requestId": "q6", "list": "rooms", "name": `x"); system.Exec("y`}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected the injection to be refused, got %v", m)
	}

	created = call(t, conn, message{"type": "createSysvar", "requestId": "q7", "name": "Gäste", "kind": "enum", "valueList": []string{"keine", "Familie", "Freunde"}})
	svID, ok := created["id"].(float64)
	if created["success"] != true || !ok {
		t.Fatalf("createSysvar failed: %v", created)
	}
	sysvars := fmt.Sprint(call(t, conn, message{"type": "getSysvars", "requestId": "q8"})["sysvars"])
	if !strings.Contains(sysvars, "Gäste") || !strings.Contains(sysvars, "Freunde") {
		t.Fatalf("sysvar not created: %v", sysvars)
	}
	if m := call(t, conn, message{"type": "renameSysvar", "requestId": "q9", "id": svID, "name": "Besuch"}); m["success"] != true {
		t.Fatalf("renameSysvar failed: %v", m)
	}
	if m := call(t, conn, message{"type": "deleteSysvar", "requestId": "q10", "id": svID}); m["success"] != true {
		t.Fatalf("deleteSysvar failed: %v", m)
	}
	if m := call(t, conn, message{"type": "createSysvar", "requestId": "q11", "name": "Leer", "kind": "enum"}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected an enum without values to be refused, got %v", m)
	}

	// Guests may not
	loginAs(t, conn, "Gast", "gast")
	if m := call(t, conn, message{"type": "createGroup", "requestId": "q12", "list": "trades", "name": "Garten"}); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", m)
	}
}

func TestStackAlarmMessages(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	alarms := func(requestID string) []any {
		return call(t, conn, message{"type": "getAlarmMessages", "requestId": requestID})["alarms"].([]any)
	}
	list := alarms("a1")
	if len(list) != 1 {
		t.Fatalf("expected the water alarm, got %v", list)
	}
	alarm := list[0].(map[string]any)
	if alarm["name"] != "Wasseralarm" || alarm["active"] != true || alarm["message"] != "Wasser erkannt" || alarm["counter"] != 1.0 {
		t.Fatalf("unexpected alarm: %v", alarm)
	}

	if m := call(t, conn, message{"type": "acknowledgeAlarmMessage", "requestId": "a2", "id": alarm["id"]}); m["success"] != true {
		t.Fatalf("acknowledge failed: %v", m)
	}
	if list := alarms("a3"); len(list) != 0 {
		t.Fatalf("alarm still listed: %v", list)
	}

	// Triggered again: back in the list, counted twice
	call(t, conn, message{"type": "setSysvar", "requestId": "a4", "id": alarm["id"], "value": true})
	if list := alarms("a5"); len(list) != 1 || list[0].(map[string]any)["counter"] != 2.0 {
		t.Fatalf("expected the alarm again, got %v", list)
	}
}

func TestStackProgramEditor(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	call(t, conn, message{"type": "elevate", "password": "secret", "requestId": "e"})

	read := func(requestID string, id any) map[string]any {
		m := call(t, conn, message{"type": "getProgram", "requestId": requestID, "id": id})
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
	saved := call(t, conn, message{"type": "saveProgram", "requestId": "p2", "program": created})
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
	if m := call(t, conn, message{"type": "saveProgram", "requestId": "p4", "program": created}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}

	if m := call(t, conn, message{"type": "deleteProgram", "requestId": "p5", "id": saved["id"]}); m["success"] != true {
		t.Fatalf("deleteProgram failed: %v", m)
	}
	if m := call(t, conn, message{"type": "getProgram", "requestId": "p6", "id": saved["id"]}); m["code"] != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %v", m)
	}
}

func TestStackHistory(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	call(t, conn, message{"type": "elevate", "password": "secret", "requestId": "e"})

	call(t, conn, message{"type": "setChannelOption", "requestId": "o", "id": 101, "option": "logged", "value": true})
	history := call(t, conn, message{"type": "getHistory", "requestId": "h1", "start": 0, "count": 50})
	entries := history["entries"].([]any)
	if history["total"] != 1.0 || len(entries) != 1 {
		t.Fatalf("unexpected history: %v", history)
	}
	if e := entries[0].(map[string]any); e["name"] != "Wohnzimmer Licht" || e["datapoint"] != "STATE" || e["kind"] != "channel" {
		t.Fatalf("unexpected entry: %v", e)
	}
	call(t, conn, message{"type": "setChannelOption", "requestId": "o2", "id": 401, "option": "logged", "value": true})
	byChannel := call(t, conn, message{"type": "getHistory", "requestId": "hc", "start": 0, "count": 500, "channel": 401})["entries"].([]any)
	if len(byChannel) != 48 {
		t.Fatalf("expected 24 temperature and 24 humidity entries, got %d", len(byChannel))
	}
	for _, e := range byChannel {
		if e.(map[string]any)["name"] != "Wohnzimmer Thermostat" {
			t.Fatalf("entry of another channel: %v", e)
		}
	}
	if m := call(t, conn, message{"type": "getHistory", "requestId": "h2", "start": 0, "count": 501}); m["code"] != "INVALID_REQUEST" {
		t.Fatalf("expected INVALID_REQUEST, got %v", m)
	}
	if m := call(t, conn, message{"type": "clearHistory", "requestId": "h3"}); m["success"] != true {
		t.Fatalf("clearHistory failed: %v", m)
	}
	if m := call(t, conn, message{"type": "getHistory", "requestId": "h4"}); m["total"] != 0.0 {
		t.Fatalf("history not cleared: %v", m)
	}
}

func TestStackDevicePrograms(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Gast", "gast")
	programs := call(t, conn, message{"type": "getDevicePrograms", "requestId": "d1", "address": "LEQ0000002"})["programs"].([]any)
	if len(programs) != 1 {
		t.Fatalf("unexpected programs: %v", programs)
	}
	if p := programs[0].(map[string]any); p["id"] != 1201.0 || p["channels"].([]any)[0] != "LEQ0000002:1" {
		t.Fatalf("unexpected program: %v", p)
	}
	if m := call(t, conn, message{"type": "getDevicePrograms", "requestId": "d2", "address": "x\"; system.Exec(\""}); m["code"] != "INVALID_REQUEST" {
		t.Fatalf("expected INVALID_REQUEST, got %v", m)
	}
}

func TestStackRunScript(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	if m := call(t, conn, message{"type": "runScript", "requestId": "s1", "script": "WriteLine(\"Hallo\");\nWrite(\"a^b\");"}); m["output"] != "Hallo\na^b" || m["syntaxError"] != nil {
		t.Fatalf("unexpected answer: %v", m)
	}
	if m := call(t, conn, message{"type": "runScript", "requestId": "s2", "script": "Write(\"x\"); dom.Kaputt("}); m["syntaxError"] == nil || m["output"] != "" {
		t.Fatalf("expected a syntax error, got %v", m)
	}
	if m := call(t, conn, message{"type": "runScript", "requestId": "s3", "script": ""}); m["code"] != "INVALID_VALUE" {
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
		for _, p := range call(t, conn, message{"type": "getPrograms", "requestId": id})["programs"].([]any) {
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
	if m := call(t, conn, message{"type": "setLogicOption", "requestId": "o1", "id": 1200, "option": "operate", "value": false}); m["success"] != true {
		t.Fatalf("setLogicOption failed: %v", m)
	}
	call(t, conn, message{"type": "setLogicOption", "requestId": "o2", "id": 1200, "option": "visible", "value": false})
	if p := program("p1"); p["operate"] != false || p["visible"] != false {
		t.Fatalf("options not saved: %v", p)
	}

	// A user may no longer run it, an administrator still may
	call(t, conn, message{"type": "saveUser", "requestId": "u", "id": 0, "fullName": "Anna Muster", "level": "user", "password": "geheim!1"})
	other, _, err := websocket.DefaultDialer.Dial(fmt.Sprintf("ws://%s/", conn.RemoteAddr().String()), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	loginAs(t, other, "AnnaMuster", "geheim!1")
	if m := call(t, other, message{"type": "runProgram", "requestId": "r1", "id": 1200}); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", m)
	}
	if m := call(t, other, message{"type": "runProgram", "requestId": "r2", "id": 1201}); m["success"] != true {
		t.Fatalf("an operable program must run: %v", m)
	}
	if m := call(t, conn, message{"type": "runProgram", "requestId": "r3", "id": 1200}); m["success"] != true {
		t.Fatalf("administrators may run any program: %v", m)
	}

	// System variables: visible only
	call(t, conn, message{"type": "setLogicOption", "requestId": "o3", "id": 950, "option": "visible", "value": false})
	for _, sv := range call(t, conn, message{"type": "getSysvars", "requestId": "s"})["sysvars"].([]any) {
		if sv := sv.(map[string]any); sv["id"] == 950.0 && sv["visible"] != false {
			t.Fatalf("sysvar still visible: %v", sv)
		}
	}
	if m := call(t, conn, message{"type": "setLogicOption", "requestId": "o4", "id": 950, "option": "operate", "value": false}); m["code"] != "NOT_FOUND" {
		t.Fatalf("operate is for programs only, got %v", m)
	}
	if m := call(t, conn, message{"type": "setLogicOption", "requestId": "o5", "id": 950, "option": "visible", "value": "yes"}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
}

func TestStackEditSysvar(t *testing.T) {
	_, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	sysvar := func(id float64) map[string]any {
		for _, sv := range call(t, conn, message{"type": "getSysvars", "requestId": "g"})["sysvars"].([]any) {
			if sv := sv.(map[string]any); sv["id"] == id {
				return sv
			}
		}
		t.Fatalf("sysvar %v missing", id)
		return nil
	}
	edit := func(id string, m message) message {
		m["type"], m["requestId"] = "editSysvar", id
		return call(t, conn, m)
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

func TestStackDiagrams(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")

	if m := call(t, conn, message{"type": "getDiagrams", "requestId": "d1"}); len(m["diagrams"].([]any)) != 0 {
		t.Fatalf("diagrams: %v", m)
	}
	// The thermostat's channel is logged: its system protocol fills the
	// diagram from the start
	call(t, conn, message{"type": "setChannelOption", "requestId": "d2", "id": 401, "option": "logged", "value": true})

	diagram := map[string]any{"name": "Wohnzimmer", "period": "week", "series": []any{
		map[string]any{"address": "LEQ0000004:1", "datapoint": "ACTUAL_TEMPERATURE", "color": "#ef4444", "unit": "°C"},
		map[string]any{"address": "sysvar", "datapoint": "951"},
	}}
	saved := call(t, conn, message{"type": "saveDiagram", "requestId": "d3", "diagram": diagram})
	if saved["success"] != true {
		t.Fatalf("save: %v", saved)
	}
	id := saved["diagram"].(map[string]any)["id"].(string)

	query := func(requestID string, from, to time.Time) []any {
		return call(t, conn, message{"type": "getDiagramData", "requestId": requestID, "from": from.UnixMilli(), "to": to.UnixMilli(), "buckets": 500,
			"series": []any{map[string]any{"address": "LEQ0000004:1", "datapoint": "ACTUAL_TEMPERATURE"}, map[string]any{"address": "sysvar", "datapoint": "951"}}})["series"].([]any)
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
	if m := call(t, guest, message{"type": "deleteDiagram", "requestId": "g1", "id": id}); m["code"] != "FORBIDDEN" {
		t.Errorf("guest deleted: %v", m)
	}
	if m := call(t, guest, message{"type": "getDiagrams", "requestId": "g2"}); len(m["diagrams"].([]any)) != 1 {
		t.Errorf("guest sees: %v", m)
	}

	if m := call(t, conn, message{"type": "saveDiagram", "requestId": "d6", "diagram": map[string]any{"name": "", "series": []any{}}}); m["code"] != "INVALID_VALUE" {
		t.Errorf("invalid saved: %v", m)
	}
	if m := call(t, conn, message{"type": "deleteDiagram", "requestId": "d7", "id": id}); m["success"] != true {
		t.Errorf("delete: %v", m)
	}
	if m := call(t, conn, message{"type": "deleteDiagram", "requestId": "d8", "id": id}); m["code"] != "NOT_FOUND" {
		t.Errorf("delete twice: %v", m)
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
	saved := call(t, conn, message{"type": "saveRule", "requestId": "r1", "rule": rule})
	if saved["success"] != true {
		t.Fatalf("save: %v", saved)
	}
	id := saved["rule"].(map[string]any)["id"].(string)

	list := call(t, conn, message{"type": "getRules", "requestId": "r2"})["rules"].([]any)
	if len(list) != 1 || list[0].(map[string]any)["id"] != id {
		t.Fatalf("rules: %v", list)
	}

	rule["from"] = "22:00"
	if m := call(t, conn, message{"type": "saveRule", "requestId": "r3", "rule": rule}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("time window without end: %v", m)
	}

	if m := call(t, conn, message{"type": "deleteRule", "requestId": "r4", "id": id}); m["success"] != true {
		t.Fatalf("delete: %v", m)
	}
	if m := call(t, conn, message{"type": "deleteRule", "requestId": "r5", "id": id}); m["code"] != "NOT_FOUND" {
		t.Fatalf("delete twice: %v", m)
	}
}
