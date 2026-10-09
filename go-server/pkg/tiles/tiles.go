// Package tiles keeps how the app shows tiles, for every device the same:
// the layout arranged by hand on a room, trade or favorite list, and the
// tile chosen for a switch channel (lamp or switch). In a file of its own
// (mui-tiles.json), written atomically: safe as soon as it is saved, also
// when the CCU restarts right after, which ReGa metadata was not (ReGa
// writes its object model only every few minutes, not on exit).
package tiles

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"sync"

	"ccu-addon-mui-server/pkg/atomicfile"
)

// The tiles a switch channel can show
const (
	Light  = "light"
	Switch = "switch"
)

// MaxLayout is the size a layout may have (JSON); one of a large room is a
// few kB
const MaxLayout = 30000

// maxTiles bounds the tiles chosen, far above the channels of a CCU
const maxTiles = 10000

// ErrInvalid: not a layout (JSON object up to MaxLayout) or not a tile
var ErrInvalid = errors.New("invalid")

type file struct {
	// By the ReGa id of the room, trade or favorite list
	Layouts map[int64]json.RawMessage `json:"layouts"`
	// By the ReGa id of the channel
	Tiles map[int64]string `json:"tiles"`
}

type Store struct {
	path string
	mu   sync.Mutex
	data file
}

// Open reads the file; a missing one means nothing arranged or chosen yet
func Open(path string) (*Store, error) {
	s := &Store{path: path}
	if err := atomicfile.ReadJSON(path, &s.data); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if s.data.Layouts == nil {
		s.data.Layouts = map[int64]json.RawMessage{}
	}
	if s.data.Tiles == nil {
		s.data.Tiles = map[int64]string{}
	}
	return s, nil
}

// Layout returns the layout of a view as JSON, "" if none
func (s *Store) Layout(id int64) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return string(s.data.Layouts[id])
}

// SetLayout stores the layout of a view ("" removes it). Layouts of views
// that no longer exist (exists false) are dropped with it.
func (s *Store) SetLayout(id int64, layout string, exists func(id int64) bool) error {
	if len(layout) > MaxLayout || (layout != "" && !isObject(layout)) {
		return ErrInvalid
	}
	// Compact, so it reads back the same after a restart
	var compact bytes.Buffer
	if layout != "" {
		_ = json.Compact(&compact, []byte(layout))
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	layouts := maps.Clone(s.data.Layouts)
	maps.DeleteFunc(layouts, func(view int64, _ json.RawMessage) bool { return !exists(view) })
	if layout == "" {
		delete(layouts, id)
	} else {
		layouts[id] = json.RawMessage(compact.Bytes())
	}
	return s.save(file{Layouts: layouts, Tiles: s.data.Tiles})
}

// Tile returns the tile chosen for a channel, "" for the app's own choice
func (s *Store) Tile(id int64) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.data.Tiles[id]
}

// SetTile stores the tile of a channel: Light, Switch, or "" for the app's
// own choice (by name and trade)
func (s *Store) SetTile(id int64, tile string) error {
	if tile != "" && tile != Light && tile != Switch {
		return ErrInvalid
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	tiles := maps.Clone(s.data.Tiles)
	if tile == "" {
		delete(tiles, id)
	} else {
		if _, ok := tiles[id]; !ok && len(tiles) >= maxTiles {
			return ErrInvalid
		}
		tiles[id] = tile
	}
	return s.save(file{Layouts: s.data.Layouts, Tiles: tiles})
}

// save writes next and keeps it once it is on the flash
func (s *Store) save(next file) error {
	data, err := json.Marshal(next)
	if err != nil {
		return err
	}
	if err := atomicfile.Write(s.path, data, 0o644); err != nil {
		return err
	}
	s.data = next
	return nil
}

func isObject(layout string) bool {
	var v map[string]json.RawMessage
	return json.Unmarshal([]byte(layout), &v) == nil
}
