package occulite

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestDetect(t *testing.T) {
	dir := t.TempDir()
	defer func(v, b string) { VersionFile, OcculitedBin = v, b }(VersionFile, OcculitedBin)
	VersionFile = filepath.Join(dir, "VERSION")
	OcculitedBin = filepath.Join(dir, "occulited")

	// A CCU: neither the LITE= line nor occulited; VARIANT=lite alone is no
	// marker
	_ = os.WriteFile(VersionFile, []byte("VERSION=3.83.6\nPRODUCT=raspmatic_rpi4\nVARIANT=lite\n"), 0o644)
	if Detect() {
		t.Fatal("CCU taken for openccu-lite")
	}
	_ = os.WriteFile(VersionFile, []byte("VERSION=3.83.6\nLITE=1.0.0-dev.42\n"), 0o644)
	if !Detect() || Version() != "1.0.0-dev.42" {
		t.Fatalf("LITE= line: %v %q", Detect(), Version())
	}
	// occulited installed without the line
	_ = os.WriteFile(VersionFile, []byte("VERSION=3.83.6\n"), 0o644)
	_ = os.WriteFile(OcculitedBin, []byte("#!/bin/sh\n"), 0o755)
	if !Detect() {
		t.Fatal("executable occulited not detected")
	}
	_ = os.Chmod(OcculitedBin, 0o644)
	if Detect() {
		t.Fatal("non-executable occulited detected")
	}
}

func TestCheckSession(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/auth/v1/state" {
			http.NotFound(w, r)
			return
		}
		switch r.Header.Get("Authorization") {
		case "Bearer SESSIONAAAAAAAAAAAAAAAAAAAA":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"authenticated": true, "sid": "SESSIONAAAAAAAAAAAAAAAAAAAA", "user": "anna", "level": "configure"})
		case "Bearer olt_token":
			// An API token at the gate: no sid
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"authenticated": true, "user": "token:tablet"})
		default:
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"authenticated": false})
		}
	}))
	defer server.Close()
	c := New(server.URL, "")
	if s, err := c.CheckSession(context.Background(), "SESSIONAAAAAAAAAAAAAAAAAAAA"); err != nil || s.User != "anna" || s.Level != LevelConfigure {
		t.Fatalf("session: %+v %v", s, err)
	}
	for _, value := range []string{"", "olt_token", "forged"} {
		if _, err := c.CheckSession(context.Background(), value); !errors.Is(err, ErrNoSession) {
			t.Fatalf("%q: %v", value, err)
		}
	}
	// occulited not answering is no logout
	server.Close()
	if _, err := c.CheckSession(context.Background(), "SESSIONAAAAAAAAAAAAAAAAAAAA"); err == nil || errors.Is(err, ErrNoSession) {
		t.Fatalf("unreachable: %v", err)
	}
}
