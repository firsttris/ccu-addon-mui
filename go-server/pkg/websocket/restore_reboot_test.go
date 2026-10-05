package websocket

import (
	"os/exec"
	"strings"
	"testing"
)

// The script runs on the CCU's BusyBox shell; at least it must parse, and
// it reboots in both cases: restore staged, server gone
func TestRestoreRebootScript(t *testing.T) {
	if out, err := exec.Command("sh", "-n", "-c", restoreRebootScript).CombinedOutput(); err != nil {
		t.Fatalf("script doesn't parse: %v %s", err, out)
	}
	if strings.Count(restoreRebootScript, "exec /sbin/reboot") != 2 {
		t.Fatal("expected a reboot for the staged restore and for the stopped server")
	}
}
