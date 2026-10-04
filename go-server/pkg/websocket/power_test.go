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
