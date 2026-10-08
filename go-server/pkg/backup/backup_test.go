package backup

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestFileName(t *testing.T) {
	now := time.Date(2026, 10, 3, 12, 5, 0, 0, time.UTC)
	for header, want := range map[string]string{
		"attachment;filename=ccu3-webui-2026-10-03.sbk": "ccu3-webui-2026-10-03.sbk",
		`attachment; filename="../../etc/passwd"`:       "ccu-backup-2026-10-03-1205.sbk",
		`attachment; filename="evil name.sbk"`:          "ccu-backup-2026-10-03-1205.sbk",
		"":                                              "ccu-backup-2026-10-03-1205.sbk",
	} {
		if got := fileName(header, now); got != want {
			t.Errorf("fileName(%q) = %q, want %q", header, got, want)
		}
	}
}

func TestExpiredDownload(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "b.sbk")
	if err := os.WriteFile(path, []byte("backup"), 0o600); err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	s := New("http://unused", dir, "")
	s.now = func() time.Time { return now }
	s.downloads["abc"] = &Backup{ID: "abc", FileName: "b.sbk", Size: 6, path: path, expires: now.Add(-time.Second)}

	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ws/mui/backup/abc", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expired download: status %d", rec.Code)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("expired backup was not removed")
	}
}

// Backups and uploads of a previous run don't stay on the user partition
func TestNewRemovesLeftovers(t *testing.T) {
	dir, firmwareDir := t.TempDir(), t.TempDir()
	for _, path := range []string{
		filepath.Join(dir, "mui-backup-1.sbk"), filepath.Join(dir, "mui-restore-2.sbk"),
		filepath.Join(dir, "mui-devfw-3.tgz"), filepath.Join(dir, "other.txt"),
		filepath.Join(firmwareDir, "mui-firmware-4"), filepath.Join(firmwareDir, "other.tgz"),
	} {
		if err := os.WriteFile(path, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	// A checked firmware, linked for the update: stays
	if err := os.MkdirAll(filepath.Join(firmwareDir, "mui-firmware-5-dir", "x"), 0o700); err != nil {
		t.Fatal(err)
	}
	New("http://unused", dir, firmwareDir)
	names := func(dir string) (names []string) {
		entries, _ := os.ReadDir(dir)
		for _, e := range entries {
			names = append(names, e.Name())
		}
		return names
	}
	if left := names(dir); len(left) != 1 || left[0] != "other.txt" {
		t.Fatalf("left in the backup directory: %v", left)
	}
	if left := names(firmwareDir); len(left) != 2 || left[0] != "mui-firmware-5-dir" || left[1] != "other.tgz" {
		t.Fatalf("left in the firmware directory: %v", left)
	}
}
