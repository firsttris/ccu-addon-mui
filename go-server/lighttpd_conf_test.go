package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"testing"

	"ccu-addon-mui-server/pkg/config"
)

// lighttpd forwards the app's WebSocket and scripts to the server: the port
// in the fragments, the server's default (config.go) and the one
// lighttpd-conf.sh takes from mui.conf have to be the same, or the app stays
// white after an update.

var fragments = []string{"../addon_installer/lighttpd.conf", "../addon_installer/lite/lighttpd.conf"}

var proxyPort = regexp.MustCompile(`"port" => (\d+)`)

func proxyPorts(t *testing.T, conf string) []int {
	t.Helper()
	var ports []int
	for _, m := range proxyPort.FindAllStringSubmatch(conf, -1) {
		port, _ := strconv.Atoi(m[1])
		ports = append(ports, port)
	}
	if len(ports) == 0 {
		t.Fatalf("no proxy port in:\n%s", conf)
	}
	return ports
}

func lighttpdConf(t *testing.T, fragment, muiConf string) string {
	t.Helper()
	confFile := filepath.Join(t.TempDir(), "mui.conf")
	if muiConf != "" {
		if err := os.WriteFile(confFile, []byte(muiConf), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	out, err := exec.Command("sh", "../addon_installer/lighttpd-conf.sh", fragment, confFile).Output()
	if err != nil {
		t.Fatalf("lighttpd-conf.sh: %v", err)
	}
	return string(out)
}

// Not 8088 and 9099: the Mediola NEO Server of OpenCCU listens there
// (libfirewall.tcl, Firewall_SERVICES(NEOSERVER)) and takes them when it
// starts first (#224)
func TestServerPortsAreNotTheNeoServers(t *testing.T) {
	cfg := config.Load()
	for _, port := range []int{cfg.WSPort, cfg.RPCServerPort} {
		if port == 8088 || port == 9099 {
			t.Errorf("port %d belongs to the Mediola NEO Server", port)
		}
	}
}

func TestLighttpdFragmentsNameTheServersDefaultPort(t *testing.T) {
	want := config.Load().WSPort
	for _, fragment := range fragments {
		data, err := os.ReadFile(fragment)
		if err != nil {
			t.Fatal(err)
		}
		for _, port := range proxyPorts(t, string(data)) {
			if port != want {
				t.Errorf("%s: proxy to %d, the server listens on %d", fragment, port, want)
			}
		}
		// Unchanged without a mui.conf
		if out := lighttpdConf(t, fragment, ""); out != string(data) {
			t.Errorf("%s changed without a mui.conf:\n%s", fragment, out)
		}
	}
}

func TestLighttpdConfTakesThePortFromMuiConf(t *testing.T) {
	for _, tc := range []struct {
		name, muiConf string
		want          int
	}{
		{"plain", "AUTH_MODE=none\nWS_PORT=12345\n", 12345},
		{"quoted", `WS_PORT="12346"` + "\n", 12346},
		{"export, single quotes", "export WS_PORT='12347'\n", 12347},
		{"the last one wins, as when sourced", "WS_PORT=11111\nWS_PORT=12348\n", 12348},
		{"Windows line end", "WS_PORT=12349\r\n", 12349},
		{"not set", "AUTH_MODE=none\n# WS_PORT=12345\n", 8089},
		{"empty", "WS_PORT=\n", 8089},
		{"no number", "WS_PORT=abc\n", 8089},
		{"zero", "WS_PORT=0\n", 8089},
		{"too large", "WS_PORT=70000\n", 8089},
		{"injection", "WS_PORT=1/;s/x/y\n", 8089},
	} {
		t.Run(tc.name, func(t *testing.T) {
			for _, fragment := range fragments {
				out := lighttpdConf(t, fragment, tc.muiConf)
				for _, port := range proxyPorts(t, out) {
					if port != tc.want {
						t.Errorf("%s: proxy to %d, want %d", fragment, port, tc.want)
					}
				}
			}
		})
	}
}

// The server takes WS_PORT from mui.conf sourced by rc.d/mui (set -a; .
// mui.conf), the proxy from lighttpd-conf.sh: for every mui.conf both have
// to end up on the same port.
func TestLighttpdConfFollowsTheSourcedMuiConf(t *testing.T) {
	for _, tc := range []struct{ name, muiConf string }{
		{"plain", "WS_PORT=12345\n"},
		{"Windows line end", "WS_PORT=12349\r\n"},
		{"comment after the value", "WS_PORT=12350 # not the NEO Server\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			confFile := filepath.Join(t.TempDir(), "mui.conf")
			if err := os.WriteFile(confFile, []byte(tc.muiConf), 0o644); err != nil {
				t.Fatal(err)
			}
			sourced, err := exec.Command("busybox", "sh", "-c", `set -a; . "$1"; set +a; printf %s "$WS_PORT"`, "sh", confFile).Output()
			if err != nil {
				t.Fatalf("source mui.conf: %v", err)
			}
			t.Setenv("WS_PORT", string(sourced))
			want := config.Load().WSPort
			for _, fragment := range fragments {
				for _, port := range proxyPorts(t, lighttpdConf(t, fragment, tc.muiConf)) {
					if port != want {
						t.Errorf("%s: proxy to %d, the server listens on %d", fragment, port, want)
					}
				}
			}
		})
	}
}
