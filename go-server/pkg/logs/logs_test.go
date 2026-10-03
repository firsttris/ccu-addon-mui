package logs

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadWrite(t *testing.T) {
	file := filepath.Join(t.TempDir(), "syslog")
	s := New(file, t.TempDir())
	if s.Available() {
		t.Fatal("not available without the settings file")
	}
	if got := s.Read(); got.RFD != 2 || got.HmIP != "ERROR" || got.Host != "" {
		t.Fatalf("unexpected defaults: %+v", got)
	}
	_ = os.WriteFile(file, []byte("LOGHOST=log.local\nLOGLEVEL_RFD=4\nLOGLEVEL_HS485D=5\nLOGLEVEL_REGA=1\nLOGLEVEL_HMIP=WARN\n"), 0o644)
	if got := s.Read(); got != (Settings{Host: "log.local", RFD: 4, HS485D: 5, Rega: 1, HmIP: "WARN"}) {
		t.Fatalf("unexpected settings: %+v", got)
	}

	if err := s.Write(Settings{RFD: 1, HS485D: 5, Rega: 3, HmIP: "TRACE"}); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(file)
	if string(data) != "LOGLEVEL_RFD=1\nLOGLEVEL_HS485D=5\nLOGLEVEL_REGA=3\nLOGLEVEL_HMIP=TRACE\n" {
		t.Fatalf("unexpected file: %q", data)
	}
	for _, bad := range []Settings{
		{RFD: 3, HS485D: 2, Rega: 2, HmIP: "INFO"},
		{RFD: 2, HS485D: 2, Rega: 4, HmIP: "INFO"},
		{RFD: 2, HS485D: 2, Rega: 2, HmIP: "LOUD"},
		{RFD: 2, HS485D: 2, Rega: 2, HmIP: "INFO", Host: "a\nLOGLEVEL_RFD=5"},
	} {
		if err := s.Write(bad); err == nil {
			t.Fatalf("accepted %+v", bad)
		}
	}
}
