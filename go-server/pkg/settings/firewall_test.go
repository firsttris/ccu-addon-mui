package settings

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestFirewall(t *testing.T) {
	dir := t.TempDir()
	s := New(dir)
	if _, err := s.Firewall(); !errors.Is(err, ErrNoFirewall) {
		t.Fatalf("without file: %v", err)
	}
	data, _ := os.ReadFile("../../../fixtures/firewall.conf")
	// An older file without a newer port and with user ports
	data = append([]byte("USERPORTS = 8080 1883\n"), data...)
	_ = os.WriteFile(filepath.Join(dir, "firewall.conf"), []byte(string(data)), 0o644)
	fw, err := s.Firewall()
	if err != nil || fw.Mode != "RESTRICTIVE" || len(fw.IPs) != 2 || fw.IPs[1] != "fc00::/7" || len(fw.UserPorts) != 2 || len(fw.Services) != 4 {
		t.Fatalf("read: %+v %v", fw, err)
	}
	for _, s := range fw.Services {
		if s.ID == "XMLRPC" && (s.Access != "restricted" || len(s.Ports) != 9) {
			t.Errorf("xmlrpc: %+v", s)
		}
	}
	if err := fw.Validate(); err != nil {
		t.Errorf("valid: %v", err)
	}
	for name, bad := range map[string]Firewall{
		"mode":   {Mode: "OPEN"},
		"access": {Mode: "MOST_OPEN", Services: []FirewallService{{ID: "REGA", Access: "some"}}},
		"ip":     {Mode: "MOST_OPEN", IPs: []string{"192.168.1"}},
		"port":   {Mode: "MOST_OPEN", UserPorts: []string{"70000"}},
	} {
		if err := bad.Validate(); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: %v", name, err)
		}
	}
}
