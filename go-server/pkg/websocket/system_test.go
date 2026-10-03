package websocket

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFirmwareVersion(t *testing.T) {
	file := filepath.Join(t.TempDir(), "VERSION")
	_ = os.WriteFile(file, []byte("VERSION=3.79.6\nPRODUCT=ccu3\n"), 0o644)
	previous := firmwareVersionFile
	firmwareVersionFile = file
	defer func() { firmwareVersionFile = previous }()

	if got := firmwareVersion(); got != "3.79.6" {
		t.Fatalf("firmwareVersion = %q", got)
	}
	firmwareVersionFile = filepath.Join(t.TempDir(), "missing")
	if got := firmwareVersion(); got != "" {
		t.Fatalf("expected no version without the file, got %q", got)
	}
}

func TestTimeConfLocation(t *testing.T) {
	previous := timeConfFile
	defer func() { timeConfFile = previous }()
	timeConfFile = filepath.Join(t.TempDir(), "time.conf")

	// Without the file nothing is written
	if err := writeTimeConfLocation(1, 2); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(timeConfFile); !os.IsNotExist(err) {
		t.Fatal("time.conf should not be created")
	}

	os.WriteFile(timeConfFile, []byte("COUNTRY=Deutschland\nCITY='Berlin'\nLATITUDE=52.52\nLONGITUDE=13.405\nTIMEZONE=CET/CEST\n"), 0o644)
	if err := writeTimeConfLocation(48.137154, 11.576124); err != nil {
		t.Fatal(err)
	}
	conf := readTimeConf()
	if conf["CITY"] != "Berlin" || conf["LATITUDE"] != "48.137154" || conf["LONGITUDE"] != "11.576124" || conf["TIMEZONE"] != "CET/CEST" {
		t.Fatalf("unexpected time.conf: %v", conf)
	}
}
