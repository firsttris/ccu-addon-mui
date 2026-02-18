package config

import "testing"

func TestLoadDefaultsForLocalhost(t *testing.T) {
	t.Setenv("CCU_HOST", "")
	t.Setenv("WS_PORT", "")
	t.Setenv("RPC_PORT", "")
	t.Setenv("HMIP_PORT", "")
	t.Setenv("RPC_SERVER_PORT", "")
	t.Setenv("REGA_PORT", "")
	t.Setenv("DEBUG", "")
	t.Setenv("CALLBACK_HOST", "")

	cfg := Load()

	if cfg.CCUHost != "localhost" {
		t.Fatalf("expected CCUHost localhost, got %q", cfg.CCUHost)
	}
	if cfg.RegaPort != 8183 {
		t.Fatalf("expected RegaPort 8183 for localhost, got %d", cfg.RegaPort)
	}
	if cfg.WSPort != 8088 || cfg.RPCPort != 2001 || cfg.HmIPPort != 2010 || cfg.RPCServerPort != 9099 {
		t.Fatalf("unexpected default ports: ws=%d rpc=%d hmip=%d rpcServer=%d", cfg.WSPort, cfg.RPCPort, cfg.HmIPPort, cfg.RPCServerPort)
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
