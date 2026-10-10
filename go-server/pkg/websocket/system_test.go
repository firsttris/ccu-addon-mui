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
