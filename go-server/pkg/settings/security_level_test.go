package settings

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSecurityLevel(t *testing.T) {
	dir := t.TempDir()
	s := New(dir)
	write := func(mode, xmlrpc, rega, neo string) {
		conf := "MODE = " + mode + "\n\nIPs = \n\nUSERPORTS = \n\n" +
			"[Service0]\nId = XMLRPC\nPorts = 2000\nAccess = " + xmlrpc + "\n\n" +
			"[Service1]\nId = REGA\nPorts = 8181\nAccess = " + rega + "\n\n" +
			"[Service2]\nId = NEOSERVER\nPorts = 8088\nAccess = " + neo + "\n"
		_ = os.WriteFile(filepath.Join(dir, "firewall.conf"), []byte(conf), 0o644)
	}
	_ = s.SetFlag(userAckInstallWizard, true)
	for _, tc := range []struct {
		mode, xmlrpc, rega, neo string
		auth                    bool
		want                    string
	}{
		{"RESTRICTIVE", "none", "none", "none", true, SecurityLevelHigh},
		{"RESTRICTIVE", "restricted", "restricted", "restricted", true, SecurityLevelMedium},
		{"MOST_OPEN", "full", "restricted", "full", false, SecurityLevelLow},
		{"RESTRICTIVE", "full", "none", "none", true, SecurityLevelCustom},
		// Restrictive without authentication: not a level of the wizard
		{"RESTRICTIVE", "none", "none", "none", false, SecurityLevelCustom},
	} {
		write(tc.mode, tc.xmlrpc, tc.rega, tc.neo)
		_ = s.SetFlag(AuthEnabled, tc.auth)
		if got, err := s.SecurityLevel(); err != nil || got != tc.want {
			t.Errorf("%+v: %s %v", tc, got, err)
		}
	}
}
