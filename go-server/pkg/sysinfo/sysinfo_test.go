package sysinfo

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRead(t *testing.T) {
	Root = t.TempDir()
	defer func() { Root = "" }()
	write := func(p, content string) {
		full := filepath.Join(Root, p)
		_ = os.MkdirAll(filepath.Dir(full), 0o755)
		_ = os.WriteFile(full, []byte(content), 0o644)
	}
	write("/proc/device-tree/model", "Raspberry Pi 4 Model B Rev 1.4\x00")
	write("/var/hm_mode", "HM_HOST='rpi4'\nHM_HMIP_SERIAL='3014F711A0001F5A49917A2B'\n")
	write("/proc/meminfo", "MemTotal:  4000000 kB\nMemAvailable:  3000000 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n")
	write("/proc/uptime", "93784.12 1000.00\n")
	write("/proc/loadavg", "0.15 0.20 0.25 1/234 5678\n")
	write("/sys/class/thermal/thermal_zone0/temp", "48312\n")
	write("/etc/os-release", "NAME=Buildroot\nPRETTY_NAME=\"Buildroot 2025.02\"\n")
	write("/proc/sys/kernel/ostype", "Linux\n")
	write("/proc/sys/kernel/osrelease", "6.6.51\n")
	write("/var/status/hasIP", "")
	write("/var/status/hasNTP", "")

	info := Read()
	if info.Model != "Raspberry Pi 4 Model B Rev 1.4" || info.Serial != "3014F711A0001F5A49917A2B" {
		t.Fatalf("model/serial: %+v", info)
	}
	if info.MemoryTotal != 4000000*1024 || info.MemoryUsed == nil || *info.MemoryUsed != 25 || info.SwapUsed != nil {
		t.Fatalf("memory: %+v", info)
	}
	if info.Uptime != 93784 || info.Load != "0.15 0.20 0.25" || info.Temperature == nil || *info.Temperature != 48.312 {
		t.Fatalf("uptime/load/temp: %+v", info)
	}
	if info.OS != "Buildroot 2025.02" || info.Kernel[:12] != "Linux 6.6.51" {
		t.Fatalf("os: %q %q", info.OS, info.Kernel)
	}
	on := map[string]bool{}
	for _, f := range info.Status {
		on[f.Name] = f.On
	}
	if !on["IP"] || on["Internet"] || !on["NTP"] || len(info.Status) != 5 {
		t.Fatalf("status: %+v", info.Status)
	}
	if info.RootTotal == 0 {
		t.Fatal("no root size")
	}
}

func TestReadFallbacks(t *testing.T) {
	Root = t.TempDir()
	defer func() { Root = "" }()
	_ = os.MkdirAll(filepath.Join(Root, "/sys/devices/virtual/dmi/id"), 0o755)
	_ = os.WriteFile(filepath.Join(Root, "/sys/devices/virtual/dmi/id/sys_vendor"), []byte("QEMU\n"), 0o644)
	_ = os.WriteFile(filepath.Join(Root, "/sys/devices/virtual/dmi/id/product_name"), []byte("Standard PC\n"), 0o644)
	_ = os.MkdirAll(filepath.Join(Root, "/var"), 0o755)
	_ = os.WriteFile(filepath.Join(Root, "/var/board_serial"), []byte("NEQ1234567\n"), 0o644)
	info := Read()
	if info.Model != "QEMU Standard PC" || info.Serial != "NEQ1234567" || info.Temperature != nil {
		t.Fatalf("fallbacks: %+v", info)
	}
}
