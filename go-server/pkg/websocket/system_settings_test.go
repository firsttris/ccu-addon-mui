//go:build !lite

package websocket

import (
	"os"
	"path/filepath"
	"testing"
)

func TestTimeConfLocation(t *testing.T) {
	timeConfFile := filepath.Join(t.TempDir(), "time.conf")

	// Without the file nothing is written
	if err := writeTimeConfLocation(timeConfFile, 1, 2); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(timeConfFile); !os.IsNotExist(err) {
		t.Fatal("time.conf should not be created")
	}

	os.WriteFile(timeConfFile, []byte("COUNTRY=Deutschland\nCITY='Berlin'\nLATITUDE=52.52\nLONGITUDE=13.405\nTIMEZONE=CET/CEST\n"), 0o644)
	if err := writeTimeConfLocation(timeConfFile, 48.137154, 11.576124); err != nil {
		t.Fatal(err)
	}
	conf := readTimeConf(timeConfFile)
	if conf["CITY"] != "Berlin" || conf["LATITUDE"] != "48.137154" || conf["LONGITUDE"] != "11.576124" || conf["TIMEZONE"] != "CET/CEST" {
		t.Fatalf("unexpected time.conf: %v", conf)
	}
}
