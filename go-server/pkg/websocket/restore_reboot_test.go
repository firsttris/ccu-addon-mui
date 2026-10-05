package websocket

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// runRestoreReboot runs the script with a fake reboot, a fake proc
// directory and short checks; during runs while the script runs. Returns
// whether it rebooted.
func runRestoreReboot(t *testing.T, serverAlive bool, during func(dir string)) bool {
	t.Helper()
	dir := t.TempDir()
	proc := filepath.Join(dir, "proc")
	if err := os.MkdirAll(proc, 0o700); err != nil {
		t.Fatal(err)
	}
	pid := "999999999"
	if serverAlive {
		pid = "1"
	}
	reboot := filepath.Join(dir, "reboot.sh")
	if err := os.WriteFile(reboot, []byte("#!/bin/sh\ntouch "+filepath.Join(dir, "rebooted")+"\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("sh", "-c", restoreRebootScript, "restore-reboot", pid, filepath.Join(dir, "marker"), reboot, proc, "0.01")
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() { _ = cmd.Wait(); close(done) }()
	if during != nil {
		during(dir)
	}
	select {
	case <-done:
	case <-time.After(30 * time.Second):
		_ = cmd.Process.Kill()
		t.Fatal("script did not end")
	}
	_, err := os.Stat(filepath.Join(dir, "rebooted"))
	return err == nil
}

func cgiRunning(t *testing.T, dir string, running bool) {
	t.Helper()
	p := filepath.Join(dir, "proc", "4711")
	if !running {
		os.RemoveAll(p)
		return
	}
	if err := os.MkdirAll(p, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(p, "cmdline"), []byte("/bin/tclsh\x00/www/config/cp_security.cgi\x00"), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestRestoreRebootScriptParses(t *testing.T) {
	if out, err := exec.Command("sh", "-n", "-c", restoreRebootScript).CombinedOutput(); err != nil {
		t.Fatalf("script doesn't parse: %v %s", err, out)
	}
	if strings.Contains(restoreRebootScript, "cp_security.cgi") {
		t.Fatal("the script's own command line would match the CGI")
	}
}

// The restore is staged: reboot
func TestRestoreRebootOnMarker(t *testing.T) {
	rebooted := runRestoreReboot(t, true, func(dir string) {
		_ = os.WriteFile(filepath.Join(dir, "marker"), nil, 0o600)
	})
	if !rebooted {
		t.Fatal("no reboot after the restore was staged")
	}
}

// The add-ons are stopped and the CGI still unpacks: no reboot until it
// stages the restore, however long that takes
func TestRestoreRebootWaitsForTheCGI(t *testing.T) {
	rebooted := runRestoreReboot(t, false, func(dir string) {
		cgiRunning(t, dir, true)
		// Far longer than the 10 checks after the CGI ended
		time.Sleep(time.Second)
		if _, err := os.Stat(filepath.Join(dir, "rebooted")); err == nil {
			t.Error("rebooted while the CGI was still running")
		}
		_ = os.WriteFile(filepath.Join(dir, "marker"), nil, 0o600)
	})
	if !rebooted {
		t.Fatal("no reboot after the restore was staged")
	}
}

// The add-ons are stopped and the CGI ended without staging the restore:
// only a reboot brings them back
func TestRestoreRebootAfterTheCGIFailed(t *testing.T) {
	rebooted := runRestoreReboot(t, false, func(dir string) {
		cgiRunning(t, dir, true)
		time.Sleep(200 * time.Millisecond)
		cgiRunning(t, dir, false)
	})
	if !rebooted {
		t.Fatal("no reboot after the CGI ended")
	}
}
