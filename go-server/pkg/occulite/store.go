package occulite

import (
	"errors"
	"os"
	"path/filepath"
	"sync"

	"ccu-addon-mui-server/pkg/atomicfile"
)

// ownData is what the add-on keeps for itself on openccu-lite, where the
// CCU kept it as ReGa metadata: the tile layouts of rooms, functions and
// favorite lists, the tile chosen for a channel, an input channel's mode,
// and the favorite lists. In the add-on's data directory
// (mui-lite.json), so it is in openccu-lite's backups.
type ownData struct {
	Layouts   map[int64]string `json:"layouts,omitempty"`
	Tiles     map[int64]string `json:"tiles,omitempty"`
	Modes     map[string]int   `json:"modes,omitempty"`
	Favorites []favoriteList   `json:"favorites,omitempty"`
	NextID    int64            `json:"nextId,omitempty"`
}

type favoriteList struct {
	ID    int64    `json:"id"`
	Name  string   `json:"name"`
	Users []string `json:"users,omitempty"`
	// Channels by id, in list order
	Items []int64 `json:"items"`
}

type store struct {
	mu   sync.Mutex
	path string
	data ownData
}

func openStore(dir string) (*store, error) {
	s := &store{path: filepath.Join(dir, "mui-lite.json")}
	if dir == "" {
		s.path = ""
	}
	if s.path != "" {
		if err := atomicfile.ReadJSON(s.path, &s.data); err != nil && !errors.Is(err, os.ErrNotExist) {
			return nil, err
		}
	}
	if s.data.Layouts == nil {
		s.data.Layouts = map[int64]string{}
	}
	if s.data.Tiles == nil {
		s.data.Tiles = map[int64]string{}
	}
	if s.data.Modes == nil {
		s.data.Modes = map[string]int{}
	}
	if s.data.NextID == 0 {
		s.data.NextID = 900001
	}
	return s, nil
}

// change applies fn and writes the file; s.mu is taken here
func (s *store) change(fn func(*ownData) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := fn(&s.data); err != nil {
		return err
	}
	if s.path == "" {
		return nil
	}
	return atomicfile.WriteJSON(s.path, s.data, 0o600)
}

func (s *store) read(fn func(*ownData)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	fn(&s.data)
}
