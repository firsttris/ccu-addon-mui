package tiles

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func open(t *testing.T, path string) *Store {
	t.Helper()
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func all(int64) bool { return true }

func TestKeptAfterOpeningAgain(t *testing.T) {
	path := filepath.Join(t.TempDir(), "mui-tiles.json")
	s := open(t, path)
	if s.Layout(1) != "" || s.Tile(5) != "" {
		t.Fatal("expected nothing in a new store")
	}
	if err := s.SetLayout(1, `{"v":3, "order":["lights"], "sections":{}}`, all); err != nil {
		t.Fatal(err)
	}
	if err := s.SetTile(5, Light); err != nil {
		t.Fatal(err)
	}

	// As after a restart: the same layout, compact
	s = open(t, path)
	if s.Layout(1) != `{"v":3,"order":["lights"],"sections":{}}` || s.Tile(5) != Light {
		t.Fatalf("layout %q, tile %q", s.Layout(1), s.Tile(5))
	}

	// Removed
	if err := s.SetLayout(1, "", all); err != nil {
		t.Fatal(err)
	}
	if err := s.SetTile(5, ""); err != nil {
		t.Fatal(err)
	}
	s = open(t, path)
	if s.Layout(1) != "" || s.Tile(5) != "" {
		t.Fatalf("layout %q, tile %q left", s.Layout(1), s.Tile(5))
	}
}

func TestLayoutsOfDeletedViewsAreDropped(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "mui-tiles.json"))
	_ = s.SetLayout(1, `{"v":3}`, all)
	_ = s.SetLayout(2, `{"v":3}`, all)
	if err := s.SetLayout(3, `{"v":3}`, func(id int64) bool { return id != 2 }); err != nil {
		t.Fatal(err)
	}
	if s.Layout(1) == "" || s.Layout(2) != "" || s.Layout(3) == "" {
		t.Fatalf("layouts %q %q %q", s.Layout(1), s.Layout(2), s.Layout(3))
	}
}

func TestRefusesWhatIsNoLayoutOrTile(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "mui-tiles.json"))
	for _, layout := range []string{"[]", "not json", `"text"`, `{"v":3,"x":"` + strings.Repeat("a", MaxLayout) + `"}`} {
		if err := s.SetLayout(1, layout, all); !errors.Is(err, ErrInvalid) {
			t.Errorf("layout %.20q: got %v", layout, err)
		}
	}
	if err := s.SetTile(1, "dimmer"); !errors.Is(err, ErrInvalid) {
		t.Errorf("tile: got %v", err)
	}
}

// A failed write leaves the store as it was
func TestFailedWriteKeepsTheOldState(t *testing.T) {
	dir := t.TempDir()
	s := open(t, filepath.Join(dir, "missing", "mui-tiles.json"))
	// A file where the directory would have to be
	if err := os.WriteFile(filepath.Join(dir, "missing"), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := s.SetTile(5, Switch); err == nil {
		t.Fatal("expected the write to fail")
	}
	if s.Tile(5) != "" {
		t.Fatal("tile kept although it was not written")
	}
}
