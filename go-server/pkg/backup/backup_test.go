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
	s := New("http://unused", dir)
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
