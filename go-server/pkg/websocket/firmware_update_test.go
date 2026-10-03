package websocket

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"ccu-addon-mui-server/pkg/auth"
)

func TestFirmwareUpdateURL(t *testing.T) {
	if got := firmwareUpdateURL("3.89.11", "raspmatic_rpi4", "rpi4"); got != "https://openccu.de/LATEST-VERSION.js?v=3.89.11&p=raspmatic_rpi4" {
		t.Fatalf("OpenCCU URL = %q", got)
	}
	if got := firmwareUpdateURL("3.79.6", "ccu3", ""); !strings.Contains(got, "update.homematic.com") || !strings.Contains(got, "version=3.79.6") {
		t.Fatalf("CCU3 URL = %q", got)
	}
}

func TestHandleFirmwareUpdate(t *testing.T) {
	file := filepath.Join(t.TempDir(), "VERSION")
	_ = os.WriteFile(file, []byte("VERSION=3.89.10\nPRODUCT=raspmatic_rpi4\nPLATFORM=rpi4\n"), 0o644)
	previousFile, previousURL := firmwareVersionFile, firmwareUpdateURL
	defer func() { firmwareVersionFile, firmwareUpdateURL = previousFile, previousURL }()
	firmwareVersionFile = file

	answer := "homematic.com.setLatestVersion('3.89.11.20260919', 'HM-RASPBERRYMATIC');"
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("p") != "raspmatic_rpi4" {
			t.Errorf("unexpected query %q", r.URL.RawQuery)
		}
		_, _ = w.Write([]byte(answer))
	}))
	defer upstream.Close()
	firmwareUpdateURL = func(version, product, platform string) string {
		return upstream.URL + "/LATEST-VERSION.js?v=" + version + "&p=" + product
	}

	s := NewServer(nil, nil)
	check := func(level string) map[string]interface{} {
		client := &Client{send: make(chan []byte, 1), level: level}
		s.handleFirmwareUpdate(client, "r")
		var m map[string]interface{}
		_ = json.Unmarshal(<-client.send, &m)
		return m
	}
	if m := check(auth.LevelAdmin); m["current"] != "3.89.10" || m["latest"] != "3.89.11.20260919" {
		t.Fatalf("unexpected answer: %v", m)
	}
	if m := check(auth.LevelUser); m["code"] != "FORBIDDEN" {
		t.Fatalf("users may not check: %v", m)
	}
	answer = "<html>maintenance</html>"
	if m := check(auth.LevelAdmin); m["code"] != "CCU_ERROR" {
		t.Fatalf("expected CCU_ERROR for a strange answer, got %v", m)
	}
	firmwareVersionFile = filepath.Join(t.TempDir(), "missing")
	if m := check(auth.LevelAdmin); m["code"] != "NOT_SUPPORTED" {
		t.Fatalf("expected NOT_SUPPORTED without a version, got %v", m)
	}
}
