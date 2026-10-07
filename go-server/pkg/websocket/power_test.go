//go:build !lite

package websocket

import (
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/rega"
)

// The safe mode as SafeMode.enter (safemode/enter.tcl): save ReGa, leave
// /etc/config/safemode with "1", reboot
func TestPowerActionSafeMode(t *testing.T) {
	saves := 0
	regaServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		saves++
		_, _ = io.WriteString(w, "OK\r\n")
	}))
	defer regaServer.Close()
	host, port, _ := net.SplitHostPort(regaServer.Listener.Addr().String())
	portNum, _ := strconv.Atoi(port)

	previousFile, previousAvailable, previousRun := safeModeFile, powerAvailable, runPower
	defer func() { safeModeFile, powerAvailable, runPower = previousFile, previousAvailable, previousRun }()
	safeModeFile = filepath.Join(t.TempDir(), "safemode")
	powerAvailable = func() bool { return true }
	var ran []string
	runPower = func(action string) { ran = append(ran, action) }

	s := NewServer(nil, rega.NewClient(&config.Config{CCUHost: host, RegaPort: portNum}))
	client := &Client{send: make(chan []byte, 1), level: auth.LevelAdmin, user: "Admin", elevatedUntil: time.Now().Add(time.Hour)}
	call := func(action string) map[string]interface{} {
		data, _ := json.Marshal(map[string]string{"type": "powerAction", "requestId": "p", "action": action})
		s.handleMessage(client, data)
		var answer map[string]interface{}
		_ = json.Unmarshal(<-client.send, &answer)
		return answer
	}

	if m := call("reboot"); m["success"] != true {
		t.Fatalf("reboot failed: %v", m)
	}
	if _, err := os.Stat(safeModeFile); err == nil {
		t.Fatal("a plain reboot must not leave the safe mode flag")
	}
	if m := call("safemode"); m["success"] != true {
		t.Fatalf("safe mode failed: %v", m)
	}
	if data, err := os.ReadFile(safeModeFile); err != nil || string(data) != "1\n" {
		t.Fatalf("flag file = %q, %v", data, err)
	}
	if saves != 2 || len(ran) != 2 || ran[1] != "safemode" {
		t.Fatalf("saves %d, ran %v", saves, ran)
	}
	if m := call("hibernate"); m["code"] != "INVALID_REQUEST" {
		t.Fatalf("expected INVALID_REQUEST, got %v", m)
	}
}

// The logic layer as the eQ-3 firmware chooses it (User.getReGaVersion,
// User.setReGaVersion), only where both ReGaHss binaries are there
func TestRegaVersion(t *testing.T) {
	dir := t.TempDir()
	previousFile, previousBinaries := regaVersionFile, regaBinaries
	defer func() { regaVersionFile, regaBinaries = previousFile, previousBinaries }()
	regaVersionFile = filepath.Join(dir, "ReGaHssVersion")
	regaBinaries = map[string]string{"NORMAL": filepath.Join(dir, "ReGaHss.normal"), "COMMUNITY": filepath.Join(dir, "ReGaHss.community")}

	s := NewServer(nil, nil)
	client := &Client{send: make(chan []byte, 1), level: auth.LevelAdmin, user: "Admin", elevatedUntil: time.Now().Add(time.Hour)}
	set := func(version string) map[string]interface{} {
		data, _ := json.Marshal(map[string]string{"type": "setRegaVersion", "requestId": "r", "version": version})
		s.handleMessage(client, data)
		var answer map[string]interface{}
		_ = json.Unmarshal(<-client.send, &answer)
		return answer
	}

	// OpenCCU: one ReGaHss, no choice
	if v := regaVersion(); v != "" {
		t.Fatalf("expected no choice without the binaries, got %q", v)
	}
	if m := set("NORMAL"); m["code"] != "NOT_SUPPORTED" {
		t.Fatalf("expected NOT_SUPPORTED, got %v", m)
	}

	for _, binary := range regaBinaries {
		_ = os.WriteFile(binary, nil, 0o755)
	}
	// No file, or the old LEGACY: COMMUNITY (getregaversion.tcl)
	if v := regaVersion(); v != "COMMUNITY" {
		t.Fatalf("default = %q", v)
	}
	_ = os.WriteFile(regaVersionFile, []byte("LEGACY\n"), 0o644)
	if v := regaVersion(); v != "COMMUNITY" {
		t.Fatalf("LEGACY = %q", v)
	}
	if m := set("NORMAL"); m["success"] != true {
		t.Fatalf("set failed: %v", m)
	}
	if data, _ := os.ReadFile(regaVersionFile); string(data) != "NORMAL\n" || regaVersion() != "NORMAL" {
		t.Fatalf("file = %q", data)
	}
	if m := set("DEBUG"); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
}
