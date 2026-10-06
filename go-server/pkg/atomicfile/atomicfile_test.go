package atomicfile

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWriteAndReadJSON(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sub", "rules.json")
	var missing []string
	if err := ReadJSON(path, &missing); err != nil || missing != nil {
		t.Fatalf("missing file: %v %v", missing, err)
	}
	if err := WriteJSON(path, []string{"a", "b"}, 0o600); err != nil {
		t.Fatal(err)
	}
	var got []string
	if err := ReadJSON(path, &got); err != nil || len(got) != 2 || got[1] != "b" {
		t.Fatalf("read back: %v %v", got, err)
	}
	if info, _ := os.Stat(path); info.Mode().Perm() != 0o600 {
		t.Fatalf("mode %v", info.Mode().Perm())
	}
	if _, err := os.Stat(path + ".tmp"); !os.IsNotExist(err) {
		t.Fatal("temporary file left behind")
	}
}

func TestReadJSONReportsBrokenFiles(t *testing.T) {
	path := filepath.Join(t.TempDir(), "broken.json")
	_ = os.WriteFile(path, []byte("{"), 0o600)
	var v map[string]int
	if err := ReadJSON(path, &v); err == nil {
		t.Fatal("broken JSON accepted")
	}
}
