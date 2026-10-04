package settings

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

const netconfigFile = "HOSTNAME=homematic-ccu3\nMODE=DHCP\nIP=192.168.1.20\nNETMASK=255.255.255.0\nGATEWAY=192.168.1.1\nNAMESERVER1=192.168.1.1\nNAMESERVER2=\nCURRENT_IP=x\n"

func TestNetConfig(t *testing.T) {
	dir := t.TempDir()
	s := New(dir)
	if _, err := s.NetConfig(); !errors.Is(err, ErrNoNetConfig) {
		t.Fatalf("without file: %v", err)
	}
	_ = os.WriteFile(filepath.Join(dir, "netconfig"), []byte(netconfigFile), 0o644)
	c, err := s.NetConfig()
	if err != nil || !c.DHCP || c.Hostname != "homematic-ccu3" || c.IP != "192.168.1.20" || c.DNS1 != "192.168.1.1" {
		t.Fatalf("read: %+v %v", c, err)
	}
	c.DHCP = false
	c.IP = "192.168.1.30"
	c.DNS2 = "9.9.9.9"
	c.Hostname = "ccu-keller"
	if err := s.SetNetConfig(c); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(filepath.Join(dir, "netconfig"))
	want := "HOSTNAME=ccu-keller\nMODE=MANUAL\nIP=192.168.1.30\nNETMASK=255.255.255.0\nGATEWAY=192.168.1.1\nNAMESERVER1=192.168.1.1\nNAMESERVER2=9.9.9.9\nCURRENT_IP=x\n"
	if string(data) != want {
		t.Errorf("written:\n%s", data)
	}
	// Back to DHCP: the addresses stay
	c.DHCP = true
	c.IP = "garbage"
	if err := s.SetNetConfig(c); err != nil {
		t.Fatal(err)
	}
	if c2, _ := s.NetConfig(); !c2.DHCP || c2.IP != "192.168.1.30" {
		t.Errorf("dhcp: %+v", c2)
	}
}

func TestNetConfigValidate(t *testing.T) {
	ok := NetConfig{Hostname: "ccu", IP: "10.0.0.5", Netmask: "255.255.255.0", Gateway: "10.0.0.1", DNS1: "10.0.0.1"}
	if err := ok.Validate(); err != nil {
		t.Fatal(err)
	}
	for name, c := range map[string]NetConfig{
		"hostname":   {Hostname: "ccu keller", DHCP: true},
		"ip":         {Hostname: "ccu", IP: "10.0.0", Netmask: "255.255.255.0", Gateway: "10.0.0.1"},
		"mask":       {Hostname: "ccu", IP: "10.0.0.5", Netmask: "255.0.255.0", Gateway: "10.0.0.1"},
		"gateway":    {Hostname: "ccu", IP: "10.0.0.5", Netmask: "255.255.255.0", Gateway: "10.0.1.1"},
		"nameserver": {Hostname: "ccu", IP: "10.0.0.5", Netmask: "255.255.255.0", Gateway: "10.0.0.1", DNS1: "dns"},
	} {
		if err := c.Validate(); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func TestNetState(t *testing.T) {
	route := filepath.Join(t.TempDir(), "route")
	_ = os.WriteFile(route, []byte("Iface\tDestination\tGateway \tFlags\neth0\t00000000\t0101A8C0\t0003\neth0\t0001A8C0\t00000000\t0001\n"), 0o644)
	if st := NetStateOf("eth-missing", route); st.Gateway != "" {
		t.Errorf("other interface: %+v", st)
	}
	if st := NetStateOf("eth0", route); st.Gateway != "192.168.1.1" {
		t.Errorf("gateway: %+v", st)
	}
}
