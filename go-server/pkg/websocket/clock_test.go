//go:build !lite

package websocket

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWriteTimeZone(t *testing.T) {
	dir := t.TempDir()
	f := clockFiles{
		timeConf:  filepath.Join(dir, "time.conf"),
		ntpClient: filepath.Join(dir, "ntpclient"),
		tz:        filepath.Join(dir, "TZ"),
		zoneTab:   filepath.Join(dir, "zone.tab"),
	}
	_ = os.WriteFile(f.zoneTab, []byte("# comment\nDE\t+5230+01322\tEurope/Berlin\n"), 0o644)

	if err := writeTimeZone(f, "CET/CEST"); err == nil {
		t.Fatal("time.conf is missing, nothing may be written")
	}
	_ = os.WriteFile(f.timeConf, []byte("COUNTRY=Deutschland\nCITY='Berlin'\nLATITUDE=52.52\nLONGITUDE=13.405\nTIMEZONE=CET/CEST\n"), 0o644)
	if err := writeTimeZone(f, "GMT/BST"); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(f.tz); string(data) != "GMT+0BST-1,M3.5.0/01:00:00,M10.5.0/02:00:00\n" {
		t.Fatalf("unexpected TZ: %q", data)
	}
	// zone.tab's zones are written by name
	if err := writeTimeZone(f, "Europe/Berlin"); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(f.tz); string(data) != "Europe/Berlin\n" {
		t.Fatalf("unexpected TZ: %q", data)
	}
	if conf := readTimeConf(f.timeConf); conf["TIMEZONE"] != "Europe/Berlin" || conf["CITY"] != "Berlin" {
		t.Fatalf("unexpected time.conf: %v", conf)
	}
	if err := writeTimeZone(f, "../../etc/passwd"); err == nil {
		t.Fatal("unknown zones must be refused")
	}

	if _, ok := readTimeServers(f.ntpClient); ok {
		t.Fatal("no ntpclient yet")
	}
	if err := writeTimeServers(f.ntpClient, "a b"); err != nil {
		t.Fatal(err)
	}
	if servers, ok := readTimeServers(f.ntpClient); !ok || servers != "a b" {
		t.Fatalf("unexpected servers %q", servers)
	}
	if err := writeTimeServers(f.ntpClient, "x'\nNTPSERVERS=evil"); err == nil {
		t.Fatal("line breaks and quotes must be refused")
	}
}
