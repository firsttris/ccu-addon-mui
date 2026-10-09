package backup

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestListDeviceFirmware(t *testing.T) {
	dir := t.TempDir()
	write := func(id, info string, changelog bool) {
		_ = os.MkdirAll(filepath.Join(dir, id), 0o755)
		_ = os.WriteFile(filepath.Join(dir, id, "info"), []byte(info), 0o644)
		if changelog {
			_ = os.WriteFile(filepath.Join(dir, id, "changelog.txt"), []byte("Version 2.11"), 0o644)
		}
	}
	write("0x56", "# comment=ignored\nTypeCode=0x56\nName=HM-LC-Sw1-FM\nFirmwareVersion=2.11\nCCU3FirmwareVersionMin=3.41.0\n", true)
	write("0x1234", "TypeCode=0x1234\nName=HmIP-SWDO\nFirmwareVersion=1.4.0\n", false)
	// Without a name (S62HMServer removes those)
	write("broken", "TypeCode=0x1\n", false)

	list, err := ListDeviceFirmware(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[0].Name != "HM-LC-Sw1-FM" || list[0].Version != "2.11" || !list[0].Changelog ||
		list[0].MinCCUVersion != "3.41.0" || list[1].ID != "0x1234" || list[1].Changelog {
		t.Fatalf("unexpected list: %+v", list)
	}
	if text, err := DeviceFirmwareChangelog(dir, "0x56"); err != nil || text != "Version 2.11" {
		t.Fatalf("changelog: %q %v", text, err)
	}
	if _, err := DeviceFirmwareChangelog(dir, ".."); err != ErrUploadNotFound {
		t.Fatalf("expected ErrUploadNotFound, got %v", err)
	}
	if list, err := ListDeviceFirmware(filepath.Join(dir, "missing")); err != nil || len(list) != 0 {
		t.Fatalf("missing directory: %v %v", list, err)
	}
}

func TestDeleteDeviceFirmwareFailed(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"isSuccessful":true,"errorCode":"","content":"${delDevFirmwareFailed}"}`)
	}))
	defer server.Close()
	s := New(server.URL, t.TempDir(), "")
	s.groupSessionsOnce.Do(func() { s.groupSessions = &groupSessions{sessions: map[string]string{"Admin": "abc"}} })
	if err := s.DeleteDeviceFirmware("Admin", "", "0x56", "HM-LC-Sw1-FM"); !errors.Is(err, ErrDeviceFirmwareFailed) {
		t.Fatalf("expected ErrDeviceFirmwareFailed, got %v", err)
	}
}
