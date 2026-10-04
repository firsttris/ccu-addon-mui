package websocket

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/sysinfo"
)

// The help page's facts (help.cgi): product, platform and, on the CCU, the
// system state; elsewhere no system state
func TestSystemInfoHelpFacts(t *testing.T) {
	dir := t.TempDir()
	previousFile, previousRoot := firmwareVersionFile, sysinfo.Root
	defer func() { firmwareVersionFile, sysinfo.Root = previousFile, previousRoot }()
	sysinfo.Root = dir
	_ = os.MkdirAll(filepath.Join(dir, "proc"), 0o755)
	_ = os.WriteFile(filepath.Join(dir, "proc", "loadavg"), []byte("0.10 0.20 0.30 1/2 3\n"), 0o644)

	s := NewServer(nil, nil)
	get := func() map[string]interface{} {
		client := &Client{send: make(chan []byte, 1), level: auth.LevelAdmin}
		s.handleSystemInfo(client, "i")
		var m map[string]interface{}
		_ = json.Unmarshal(<-client.send, &m)
		return m
	}

	firmwareVersionFile = filepath.Join(dir, "missing")
	if m := get(); m["system"] != nil {
		t.Fatalf("system state off the CCU: %v", m)
	}
	firmwareVersionFile = filepath.Join(dir, "VERSION")
	_ = os.WriteFile(firmwareVersionFile, []byte("VERSION=3.89.10.20260901\nPRODUCT=raspmatic_rpi4\nPLATFORM=rpi4\n"), 0o644)
	m := get()
	system, _ := m["system"].(map[string]interface{})
	if m["product"] != "raspmatic_rpi4" || m["platform"] != "rpi4" || system == nil || system["load"] != "0.10 0.20 0.30" {
		t.Fatalf("help facts: %v", m)
	}
}
