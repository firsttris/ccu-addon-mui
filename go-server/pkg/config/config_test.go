package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadDefaultsForLocalhost(t *testing.T) {
	t.Setenv("CCU_HOST", "")
	t.Setenv("WS_PORT", "")
	t.Setenv("RPC_PORT", "")
	t.Setenv("HMIP_PORT", "")
	t.Setenv("RPC_SERVER_PORT", "")
	t.Setenv("REGA_PORT", "")
	t.Setenv("DEBUG", "")
	t.Setenv("CALLBACK_HOST", "")
	t.Setenv("WS_BIND_HOST", "")
	t.Setenv("VIRTUAL_DEVICES_PORT", "")
	interfacesListFile = filepath.Join(t.TempDir(), "missing.xml")

	cfg := Load()

	if cfg.WSBindHost != "127.0.0.1" {
		t.Fatalf("expected WSBindHost 127.0.0.1, got %q", cfg.WSBindHost)
	}

	if cfg.CCUHost != "localhost" {
		t.Fatalf("expected CCUHost localhost, got %q", cfg.CCUHost)
	}
	if cfg.RegaPort != 8183 {
		t.Fatalf("expected RegaPort 8183 for localhost, got %d", cfg.RegaPort)
	}
	// On the CCU the services' own ports, not lighttpd's
	if cfg.WSPort != 8088 || cfg.RPCPort != 32001 || cfg.HmIPPort != 32010 || cfg.VirtualDevicesPort != 39292 || cfg.RPCServerPort != 9099 {
		t.Fatalf("unexpected default ports: ws=%d rpc=%d hmip=%d virtual=%d rpcServer=%d", cfg.WSPort, cfg.RPCPort, cfg.HmIPPort, cfg.VirtualDevicesPort, cfg.RPCServerPort)
	}
	if cfg.Debug {
		t.Fatal("expected Debug=false by default")
	}
	if cfg.CallbackHost != "127.0.0.1" {
		t.Fatalf("expected default CallbackHost 127.0.0.1, got %q", cfg.CallbackHost)
	}
}

func TestLoadDefaultsForNonLocalhost(t *testing.T) {
	t.Setenv("CCU_HOST", "ccu.local")
	t.Setenv("REGA_PORT", "")

	cfg := Load()

	if cfg.CCUHost != "ccu.local" {
		t.Fatalf("expected CCUHost ccu.local, got %q", cfg.CCUHost)
	}
	if cfg.RegaPort != 8181 {
		t.Fatalf("expected RegaPort 8181 for non-localhost, got %d", cfg.RegaPort)
	}
	if cfg.RPCPort != 2001 || cfg.HmIPPort != 2010 || cfg.VirtualDevicesPort != 9292 {
		t.Fatalf("expected lighttpd's ports from the LAN, got %d %d %d", cfg.RPCPort, cfg.HmIPPort, cfg.VirtualDevicesPort)
	}
}

// The ports ReGa uses, from the CCU's InterfacesList.xml
func TestLoadPortsFromInterfacesList(t *testing.T) {
	t.Setenv("CCU_HOST", "")
	t.Setenv("RPC_PORT", "")
	t.Setenv("HMIP_PORT", "")
	t.Setenv("VIRTUAL_DEVICES_PORT", "")
	path := filepath.Join(t.TempDir(), "InterfacesList.xml")
	interfacesListFile = path
	data := `<?xml version="1.0" encoding="utf-8" ?>
<interfaces v="1.0">
	<ipc><name>BidCos-RF</name><url>xmlrpc_bin://127.0.0.1:32101</url><info>BidCos-RF</info></ipc>
	<ipc><name>VirtualDevices</name><url>xmlrpc://127.0.0.1:39393/groups</url><info>Virtual Devices</info></ipc>
	<ipc><name>HmIP-RF</name><url>xmlrpc://127.0.0.1:32110</url><info>HmIP-RF</info></ipc>
</interfaces>`
	if err := os.WriteFile(path, []byte(data), 0o600); err != nil {
		t.Fatal(err)
	}

	cfg := Load()
	if cfg.RPCPort != 32101 || cfg.HmIPPort != 32110 || cfg.VirtualDevicesPort != 39393 {
		t.Fatalf("unexpected ports: %d %d %d", cfg.RPCPort, cfg.HmIPPort, cfg.VirtualDevicesPort)
	}
}

func TestLoadEnvOverridesAndInvalidIntFallback(t *testing.T) {
	t.Setenv("CCU_HOST", "192.168.0.10")
	t.Setenv("REGA_PORT", "9000")
	t.Setenv("WS_PORT", "not-a-number")
	t.Setenv("RPC_PORT", "2200")
	t.Setenv("HMIP_PORT", "2210")
	t.Setenv("RPC_SERVER_PORT", "9191")
	t.Setenv("DEBUG", "true")
	t.Setenv("CALLBACK_HOST", "10.0.0.5")

	cfg := Load()

	if cfg.WSPort != 8088 {
		t.Fatalf("expected invalid WS_PORT to fall back to 8088, got %d", cfg.WSPort)
	}
	if cfg.RPCPort != 2200 || cfg.HmIPPort != 2210 || cfg.RPCServerPort != 9191 {
		t.Fatalf("unexpected overridden ports: rpc=%d hmip=%d rpcServer=%d", cfg.RPCPort, cfg.HmIPPort, cfg.RPCServerPort)
	}
	if cfg.RegaPort != 9000 {
		t.Fatalf("expected explicit REGA_PORT 9000, got %d", cfg.RegaPort)
	}
	if !cfg.Debug {
		t.Fatal("expected Debug=true")
	}
	if cfg.CallbackHost != "10.0.0.5" {
		t.Fatalf("expected CallbackHost 10.0.0.5, got %q", cfg.CallbackHost)
	}
}

// On openccu-lite the add-on may write only its own directories: DATA_DIR
// puts all its own files there, explicit settings still win
func TestDataDirHoldsTheOwnFiles(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DATA_DIR", dir)
	t.Setenv("RULES_FILE", "/elsewhere/rules.json")
	cfg := Load()
	for name, got := range map[string]string{
		"mui-auth.key":      cfg.AuthKeyFile,
		"mui-sessions.json": cfg.SessionsFile,
		"mui-push.json":     cfg.PushFile,
		"mui-diagrams.json": cfg.DiagramsFile,
		"mui-audit.log":     cfg.AuditLogFile,
		"mui-diagrams":      cfg.DiagramsDir,
	} {
		if got != filepath.Join(dir, name) {
			t.Errorf("%s = %q", name, got)
		}
	}
	if cfg.RulesFile != "/elsewhere/rules.json" || cfg.DataDir != dir {
		t.Errorf("rules %q, data dir %q", cfg.RulesFile, cfg.DataDir)
	}
}
