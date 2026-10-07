//go:build !lite

package websocket

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/selfupdate"
)

// A release like GitHub's whose update_script writes a marker file
func selfUpdateRelease(t *testing.T, marker string) *httptest.Server {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	script := "#!/bin/sh\necho updated > " + marker + "\n"
	_ = tw.WriteHeader(&tar.Header{Name: "./update_script", Mode: 0o755, Size: int64(len(script)), Typeflag: tar.TypeReg})
	_, _ = tw.Write([]byte(script))
	_ = tw.Close()
	_ = gz.Close()
	data := buf.Bytes()
	hash := sha256.Sum256(data)
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/archive" {
			_, _ = w.Write(data)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"tag_name": "v9.9.9",
			"assets": []map[string]string{{
				"name": "mui-9.9.9-arm-ccu3-raspi.tar.gz", "browser_download_url": server.URL + "/archive",
				"digest": "sha256:" + hex.EncodeToString(hash[:]),
			}},
		})
	}))
	t.Cleanup(server.Close)
	return server
}

func TestSelfUpdate(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "updated")
	release := selfUpdateRelease(t, marker)
	versionFile := filepath.Join(t.TempDir(), "VERSION")
	_ = os.WriteFile(versionFile, []byte("VERSION=3.79.6\n"), 0o644)
	previous := firmwareVersionFile
	defer func() { firmwareVersionFile = previous }()
	firmwareVersionFile = versionFile

	s := NewServer(nil, nil)
	updater := selfupdate.New(release.URL+"/latest", t.TempDir())
	updater.Arch = "arm"
	s.SetSelfUpdate(updater)
	// The phases the last install reported, in order
	var phases []string
	call := func(client *Client, msgType string) map[string]interface{} {
		if msgType == "checkSelfUpdate" {
			s.handleCheckSelfUpdate(client, []byte(`{"type":"checkSelfUpdate","requestId":"r","force":true}`))
		} else {
			s.handleInstallSelfUpdate(client, "r")
		}
		phases = nil
		for {
			var m map[string]interface{}
			_ = json.Unmarshal(<-client.send, &m)
			if m["type"] != "selfUpdateProgress" {
				return m
			}
			if phase := m["phase"].(string); len(phases) == 0 || phases[len(phases)-1] != phase {
				phases = append(phases, phase)
			}
		}
	}
	admin := func(elevated bool) *Client {
		client := &Client{send: make(chan []byte, 64), level: auth.LevelAdmin, user: "Admin"}
		if elevated {
			client.elevatedUntil = time.Now().Add(time.Hour)
		}
		return client
	}

	if m := call(admin(false), "checkSelfUpdate"); m["latest"] != "9.9.9" || m["installable"] != true {
		t.Fatalf("unexpected check answer: %v", m)
	}
	if m := call(&Client{send: make(chan []byte, 64), level: auth.LevelUser}, "checkSelfUpdate"); m["code"] != "FORBIDDEN" {
		t.Fatalf("users may not check: %v", m)
	}
	// Installing runs code as root: only with the password entered again
	if m := call(admin(false), "installSelfUpdate"); m["code"] != "ELEVATION_REQUIRED" {
		t.Fatalf("expected ELEVATION_REQUIRED, got %v", m)
	}
	if _, err := os.Stat(marker); err == nil {
		t.Fatal("installed without elevation")
	}
	if m := call(admin(true), "installSelfUpdate"); m["success"] != true || m["version"] != "9.9.9" {
		t.Fatalf("unexpected install answer: %v", m)
	}
	if _, err := os.Stat(marker); err != nil {
		t.Fatal("update_script did not run")
	}
	// The app shows each step as it comes
	if got := strings.Join(phases, ","); got != "download,verify,unpack,install" {
		t.Fatalf("unexpected progress: %s", got)
	}

	// Off the CCU there is nothing to update
	firmwareVersionFile = filepath.Join(t.TempDir(), "missing")
	if m := call(admin(false), "checkSelfUpdate"); m["installable"] != false {
		t.Fatalf("installable off the CCU: %v", m)
	}
	if m := call(admin(true), "installSelfUpdate"); m["code"] != "NOT_SUPPORTED" {
		t.Fatalf("expected NOT_SUPPORTED off the CCU, got %v", m)
	}
}
