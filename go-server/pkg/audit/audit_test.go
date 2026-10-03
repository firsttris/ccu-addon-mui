package audit

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func readEntries(t *testing.T, path string) []Entry {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	var entries []Entry
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		var e Entry
		if err := json.Unmarshal(scanner.Bytes(), &e); err != nil {
			t.Fatal(err)
		}
		entries = append(entries, e)
	}
	return entries
}

func TestRecordAppendsJSONLines(t *testing.T) {
	path := filepath.Join(t.TempDir(), "audit.log")
	log := New(path)
	log.now = func() time.Time { return time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC) }

	for _, value := range []interface{}{true, false} {
		if err := log.Record(Entry{User: "Admin", Action: "setDatapoint", Target: "HmIP-RF.A:1.STATE", Previous: "false", Value: value, Result: "OK"}); err != nil {
			t.Fatal(err)
		}
	}
	entries := readEntries(t, path)
	if len(entries) != 2 || entries[0].User != "Admin" || entries[1].Value != false || entries[0].Time.Year() != 2026 {
		t.Fatalf("unexpected entries: %+v", entries)
	}
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("expected mode 0600, got %v", info.Mode().Perm())
	}
}

func TestRecordRotates(t *testing.T) {
	path := filepath.Join(t.TempDir(), "audit.log")
	log := New(path)
	log.maxSize = 300

	for i := 0; i < 10; i++ {
		if err := log.Record(Entry{Action: "setDatapoint", Target: "HmIP-RF.A:1.LEVEL", Value: i, Result: "OK"}); err != nil {
			t.Fatal(err)
		}
	}
	current, _ := os.Stat(path)
	if current.Size() > 300 {
		t.Fatalf("log not rotated: %d bytes", current.Size())
	}
	if _, err := os.Stat(path + ".1"); err != nil {
		t.Fatalf("expected a rotated file: %v", err)
	}
	// The newest entry is in the current file
	entries := readEntries(t, path)
	if last := entries[len(entries)-1]; last.Value != 9.0 {
		t.Fatalf("unexpected last entry: %+v", last)
	}
}

func TestDisabledAndNilLogDoNothing(t *testing.T) {
	var nilLog *Log
	if err := nilLog.Record(Entry{}); err != nil {
		t.Fatal(err)
	}
	if err := New("").Record(Entry{}); err != nil {
		t.Fatal(err)
	}
}
