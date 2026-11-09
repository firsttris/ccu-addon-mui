//go:build !lite

package main

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// status.cgi answers index.html while the server is down (lighttpd runs it
// without the server and without a login): whether the server runs, and the
// line it stopped with, nothing else of the log.

type cgiStatus struct {
	Running bool   `json:"running"`
	Reason  string `json:"reason"`
}

func runStatusCGI(t *testing.T, pidFile, logFile string) cgiStatus {
	t.Helper()
	cmd := exec.Command("sh", "../addon_installer/status.cgi")
	cmd.Env = append(os.Environ(), "MUI_PID_FILE="+pidFile, "MUI_LOG_FILE="+logFile)
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("status.cgi: %v", err)
	}
	header, body, ok := strings.Cut(string(out), "\r\n\r\n")
	if !ok || !strings.Contains(header, "Content-Type: application/json") || !strings.Contains(header, "Cache-Control: no-store") {
		t.Fatalf("CGI header missing: %q", out)
	}
	var status cgiStatus
	if err := json.Unmarshal([]byte(body), &status); err != nil {
		t.Fatalf("not JSON: %q: %v", body, err)
	}
	return status
}

func writeLog(t *testing.T, lines ...string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "mui-websocket-server.log")
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestStatusCGIGivesTheLineTheServerStoppedWith(t *testing.T) {
	log := writeLog(t,
		`2026/11/09 16:00:00 🚀 WebSocket Server starting...`,
		`2026/11/09 16:00:00 ❌ Stopped: old reason from an earlier start`,
		`2026/11/09 17:00:00 🚀 WebSocket Server starting...`,
		`2026/11/09 17:00:01 🔓 User "Paul" logged in`,
		`2026/11/09 17:00:02 ❌ Stopped: failed to load the logged-in devices: invalid character '"' \ in "x"`,
		`2026/11/09 17:00:02 🛑 something after it`,
	)
	status := runStatusCGI(t, filepath.Join(t.TempDir(), "none.pid"), log)
	want := `2026/11/09 17:00:02 ❌ Stopped: failed to load the logged-in devices: invalid character '"' \ in "x"`
	if status.Running || status.Reason != want {
		t.Fatalf("got %+v, want not running with %q", status, want)
	}
}

func TestStatusCGIGivesNoLineFromAStartWithoutError(t *testing.T) {
	log := writeLog(t,
		`2026/11/09 16:00:00 ❌ Stopped: old reason`,
		`2026/11/09 17:00:00 🚀 WebSocket Server starting...`,
		`2026/11/09 17:00:01 🔓 User "Paul" logged in from 192.168.1.20`,
	)
	if status := runStatusCGI(t, "/nonexistent.pid", log); status.Running || status.Reason != "" {
		t.Fatalf("got %+v, want not running without a reason", status)
	}
}

// The shell's error when the binary doesn't run at all: rc.d/mui writes it to
// the log, and no start line comes before it
func TestStatusCGIGivesTheShellErrorWhenTheBinaryDoesNotRun(t *testing.T) {
	log := writeLog(t,
		`2026/11/09 16:00:00 🚀 WebSocket Server starting...`,
		`/usr/local/etc/config/rc.d/mui: line 38: /usr/local/addons/mui/go-server/ccu-addon-mui-server: not found`,
	)
	status := runStatusCGI(t, "/nonexistent.pid", log)
	if !strings.HasSuffix(status.Reason, "ccu-addon-mui-server: not found") {
		t.Fatalf("got %+v", status)
	}
}

func TestStatusCGIWithoutALog(t *testing.T) {
	if status := runStatusCGI(t, "/nonexistent.pid", "/nonexistent.log"); status.Running || status.Reason != "" {
		t.Fatalf("got %+v", status)
	}
}

// Running only when the PID is the server's: a PID of a server that is gone
// may belong to another process by now
func TestStatusCGIRunningOnlyForTheServersProcess(t *testing.T) {
	if _, err := os.Stat("/proc/self/exe"); err != nil {
		t.Skip("no /proc")
	}
	// The process: this test binary, waiting in TestStatusCGIHelperProcess.
	// Not a copy of sleep: on some systems it is a multi-call binary
	// (BusyBox, Rust coreutils) that exits under any other name
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	selfBin, err := os.ReadFile(self)
	if err != nil {
		t.Fatal(err)
	}
	server := filepath.Join(t.TempDir(), "ccu-addon-mui-server")
	if err := os.WriteFile(server, selfBin, 0o755); err != nil {
		t.Fatal(err)
	}
	log := writeLog(t, `2026/11/09 16:00:00 ❌ Stopped: old reason`)

	for _, tc := range []struct {
		name    string
		binary  string
		running bool
	}{
		{"the server", server, true},
		{"another process", self, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cmd := exec.Command(tc.binary, "-test.run=^TestStatusCGIHelperProcess$")
			cmd.Env = append(os.Environ(), "MUI_STATUS_CGI_HELPER=1")
			if err := cmd.Start(); err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = cmd.Process.Kill(); _ = cmd.Wait() })
			pidFile := filepath.Join(t.TempDir(), "mui.pid")
			if err := os.WriteFile(pidFile, []byte(strconv.Itoa(cmd.Process.Pid)+"\n"), 0o644); err != nil {
				t.Fatal(err)
			}
			status := runStatusCGI(t, pidFile, log)
			if status.Running != tc.running {
				t.Fatalf("got %+v, want running %v", status, tc.running)
			}
			// A running server's log is nobody's business
			if tc.running && status.Reason != "" {
				t.Fatalf("reason given while running: %+v", status)
			}
		})
	}
}

// A ❌ line the server logs while it keeps running is not the line it
// stopped with. Killed without a word (out of memory, kill -9), it stopped
// with none: the rejected connection of a foreign page, which anyone can
// cause without a login (websocket.go), is no reason, and nothing of the
// log goes out without a login but the line it stopped with
func TestStatusCGIGivesNoLineTheServerKeptRunningAfter(t *testing.T) {
	log := writeLog(t,
		`2026/11/09 17:00:00 🚀 WebSocket Server starting...`,
		`2026/11/09 17:05:00 ❌ Rejected WebSocket connection from origin "https://evil.example" (host "ccu.local")`,
		`2026/11/09 17:06:00 🔓 User "Paul" logged in from 192.168.1.20`,
	)
	if status := runStatusCGI(t, "/nonexistent.pid", log); status.Running || status.Reason != "" {
		t.Fatalf("got %+v, want not running without a reason", status)
	}
}

// The process TestStatusCGIRunningOnlyForTheServersProcess starts: waits
// until it is killed
func TestStatusCGIHelperProcess(t *testing.T) {
	if os.Getenv("MUI_STATUS_CGI_HELPER") != "1" {
		t.Skip("only started by TestStatusCGIRunningOnlyForTheServersProcess")
	}
	time.Sleep(time.Minute)
}
