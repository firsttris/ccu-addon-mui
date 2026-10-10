package websocket

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/rega"
)

// operate: guests may not, a refusal is FORBIDDEN, a ReGa result other
// than OK is the code; each outcome is in the audit log with the previous
// value ReGa told
func TestOperate(t *testing.T) {
	s := NewServer(nil, nil)
	logFile := filepath.Join(t.TempDir(), "audit.log")
	s.SetAuditLog(audit.New(logFile))

	run := func(level string, action func() (any, string, error)) map[string]any {
		client := &Client{send: make(chan []byte, 1), level: level, user: "anna"}
		ran := false
		s.operate(client, "r", audit.Entry{Action: "runProgram", Target: "program 1"}, func() (any, string, error) {
			ran = true
			return action()
		})
		var m map[string]any
		_ = json.Unmarshal(<-client.send, &m)
		m["ran"] = ran
		return m
	}
	ok := func() (any, string, error) { return "before", rega.SetOK, nil }

	if m := run(auth.LevelGuest, ok); m["code"] != "FORBIDDEN" || m["ran"] != false {
		t.Fatalf("a guest must not operate: %v", m)
	}
	if m := run(auth.LevelUser, ok); m["success"] != true || m["type"] != "runProgram_response" || m["requestId"] != "r" {
		t.Fatalf("expected success: %v", m)
	}
	refused := func() (any, string, error) { return nil, "", fmt.Errorf("%w: admins only", errForbidden) }
	if m := run(auth.LevelUser, refused); m["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN for a refusal: %v", m)
	}
	notFound := func() (any, string, error) { return "before", rega.SetNotFound, nil }
	if m := run(auth.LevelUser, notFound); m["code"] != rega.SetNotFound {
		t.Fatalf("expected the ReGa result as code: %v", m)
	}
	failed := func() (any, string, error) { return nil, "", errors.New("unreachable") }
	if m := run(auth.LevelUser, failed); m["code"] != "CCU_ERROR" {
		t.Fatalf("expected CCU_ERROR: %v", m)
	}

	data, err := os.ReadFile(logFile)
	if err != nil {
		t.Fatal(err)
	}
	var results []string
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		var e audit.Entry
		if err := json.Unmarshal([]byte(line), &e); err != nil {
			t.Fatal(err)
		}
		if e.User != "anna" || e.Action != "runProgram" {
			t.Errorf("unexpected entry %+v", e)
		}
		results = append(results, fmt.Sprintf("%s %v", e.Result, e.Previous))
	}
	want := []string{"FORBIDDEN <nil>", "OK before", "FORBIDDEN <nil>", rega.SetNotFound + " before", "CCU_ERROR <nil>"}
	if fmt.Sprint(results) != fmt.Sprint(want) {
		t.Fatalf("audit log %v, want %v", results, want)
	}
}
