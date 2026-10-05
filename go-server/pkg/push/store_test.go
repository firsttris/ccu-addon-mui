package push

import (
	"os"
	"path/filepath"
	"testing"
)

// The key survives a reopen, and no temporary file is left behind
func TestStoreKeepsTheKey(t *testing.T) {
	path := filepath.Join(t.TempDir(), "mui-push.json")
	s, err := OpenStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.VAPID("https://example.org"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf("temporary file left: %v", err)
	}
	again, err := OpenStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if again.data.VAPIDKey == "" || again.data.VAPIDKey != s.data.VAPIDKey {
		t.Fatal("key not kept")
	}
}
