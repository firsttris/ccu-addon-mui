package addons

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func writeScript(t *testing.T, dir, name, body string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+body), 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestListAndRun(t *testing.T) {
	dir := t.TempDir()
	log := filepath.Join(dir, "..", filepath.Base(dir)+".log")
	writeScript(t, dir, "mui", `case "$1" in info) echo "Name: MUI CCU Addon"; echo "Version: 1.0"; echo "Operations: uninstall restart"; echo "Config-Url: /addons/mui/";; esac`)
	writeScript(t, dir, "redmatic", `case "$1" in
info.de) echo "Info: <b>Node-RED</b> für die CCU"; echo "Name: RedMatic"; echo "Version: 8.1"; echo "Update: /addons/red/update.cgi"; echo "Operations: restart uninstall fly";;
restart|uninstall) echo "$1" >> `+log+`;;
esac`)
	writeScript(t, dir, "noinfo", "exit 0")
	_ = os.WriteFile(filepath.Join(dir, "notexecutable"), []byte("#!/bin/sh\necho Name: X"), 0o644)

	s := New(dir, "mui", "http://ccu")
	addons := s.List("de")
	if len(addons) != 2 || addons[0].Name != "MUI CCU Addon" || addons[1].Name != "RedMatic" {
		t.Fatalf("got %+v", addons)
	}
	if !addons[0].Self || addons[0].ConfigURL != "/addons/mui/" {
		t.Fatalf("got %+v", addons[0])
	}
	red := addons[1]
	if red.Version != "8.1" || red.UpdateURL != "/addons/red/update.cgi" || len(red.Info) != 1 || red.Info[0] != "Node-RED für die CCU" || len(red.Operations) != 2 {
		t.Fatalf("got %+v", red)
	}

	if _, err := s.Run("redmatic", "restart"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Run("redmatic", "fly"); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
	if _, err := s.Run("../etc", "restart"); err == nil {
		t.Fatal("expected an error for a path")
	}
	if _, err := s.Run("mui", "uninstall"); err == nil {
		t.Fatal("this add-on must not uninstall itself")
	}
	if _, err := s.Run("redmatic", "uninstall"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "redmatic")); !os.IsNotExist(err) {
		t.Fatal("script not removed after uninstall")
	}
	data, _ := os.ReadFile(log)
	if string(data) != "restart\nuninstall\n" {
		t.Fatalf("operations run: %q", data)
	}
}

func TestCheckUpdate(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/addons/red/update.cgi" || r.URL.Query().Get("cmd") != "check_version" || r.URL.Query().Get("version") != "8.1" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte("8.2\n"))
	}))
	defer server.Close()
	s := New(t.TempDir(), "", server.URL)
	if latest, err := s.CheckUpdate("/addons/red/update.cgi", "8.1"); err != nil || latest != "8.2" {
		t.Fatalf("got %q %v", latest, err)
	}
	if _, err := s.CheckUpdate("file:///etc/passwd", "1"); err == nil {
		t.Fatal("expected an error for a file URL")
	}
}
