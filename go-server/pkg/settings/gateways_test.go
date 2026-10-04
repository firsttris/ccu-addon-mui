package settings

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestLanGateways(t *testing.T) {
	dir := t.TempDir()
	rfd := "Listen Port = 2001\n\n[Interface 0]\nType = CCU2\nComPortFile = /dev/mmd_bidcos\n\n" +
		"[Interface 1]\nType = HMLGW2\nName = Keller\nSerial Number = NEQ0123456\nEncryption Key = geheim\nIP Address = 192.168.1.40\n"
	hs := "Listen Port = 32000\n\n[Interface 0]\nType = HMWLGW\nSerial Number = JEQ0000001\nEncryption Key = wired1\n"
	_ = os.WriteFile(filepath.Join(dir, "rfd.conf"), []byte(rfd), 0o644)
	_ = os.WriteFile(filepath.Join(dir, "hs485d.conf"), []byte(hs), 0o644)
	gateways, err := New(dir).LanGateways()
	if err != nil {
		t.Fatal(err)
	}
	want := []LanGateway{
		{Class: "RF", Type: "HMLGW2", Name: "Keller", Serial: "NEQ0123456", Key: "geheim", IP: "192.168.1.40"},
		{Class: "Wired", Type: "HMWLGW", Serial: "JEQ0000001", Key: "wired1"},
	}
	if len(gateways) != 2 || gateways[0] != want[0] || gateways[1] != want[1] {
		t.Fatalf("got %+v", gateways)
	}
	if g, _ := New(t.TempDir()).LanGateways(); len(g) != 0 {
		t.Fatalf("without files: %+v", g)
	}
}

func TestValidateGateways(t *testing.T) {
	ok := LanGateway{Class: "RF", Type: "HMLGW2", Serial: "NEQ0123456", Key: "geheim", IP: "192.168.1.40"}
	if err := ValidateGateways([]LanGateway{ok, {Class: "Wired", Type: "HMWLGW", Serial: "JEQ0000001", Key: "k"}}); err != nil {
		t.Fatal(err)
	}
	for _, bad := range [][]LanGateway{
		{{Class: "RF", Type: "HMWLGW", Serial: "A1", Key: "k"}},
		{{Class: "RF", Type: "HMLGW2", Serial: "neq 1", Key: "k"}},
		{{Class: "RF", Type: "HMLGW2", Serial: "A1", Key: ""}},
		{{Class: "RF", Type: "HMLGW2", Serial: "A1", Key: "k\n[Interface 9]"}},
		{{Class: "RF", Type: "HMLGW2", Serial: "A1", Key: "k", IP: "host"}},
		{ok, ok},
		{{Class: "Wired", Type: "HMWLGW", Serial: "A1", Key: "k"}, {Class: "Wired", Type: "HMWLGW", Serial: "A2", Key: "k"}},
	} {
		if err := ValidateGateways(bad); !errors.Is(err, ErrInvalid) {
			t.Errorf("%+v: %v", bad, err)
		}
	}
	if ValidKey("a#b") || ValidKey("") || !ValidKey("Neu_123") {
		t.Error("ValidKey")
	}
}

func TestGatewayConnState(t *testing.T) {
	old := StatusDir
	StatusDir = t.TempDir()
	defer func() { StatusDir = old }()
	_ = os.WriteFile(filepath.Join(StatusDir, "NEQ0123456.connstat"), []byte("WRONG_KEY"), 0o644)
	if s := GatewayConnState("NEQ0123456"); s != "WRONG_KEY" {
		t.Fatal(s)
	}
	if s := GatewayConnState("../etc"); s != "" {
		t.Fatal(s)
	}
}
