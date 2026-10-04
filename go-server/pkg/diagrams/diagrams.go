// Package diagrams keeps the add-on's diagrams and records the values they
// show.
//
// The WebUI's diagrams (HMServer, de.eq3.lib.measurement) only record a
// fixed list of value types (energy counters, power, temperature, ...; see
// translate.lang.diagram.js) and need a microSD card
// (diagramDataloggingNotInitialised). Here any numeric or boolean datapoint
// and system variable can be recorded, on the CCU's own storage.
package diagrams

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

// Series is one line of a diagram: a channel's datapoint or a system
// variable (Address "sysvar", Datapoint its id).
type Series struct {
	Address   string `json:"address"`
	Datapoint string `json:"datapoint"`
	// Label overrides the name the app builds from the channel
	Label string `json:"label,omitempty"`
	Color string `json:"color,omitempty"`
	Unit  string `json:"unit,omitempty"`
	// Chart is how the series is drawn: line, area, bar, step or state
	// (a band of on and off); empty lets the app choose
	Chart string `json:"chart,omitempty"`
	// Aggregate is what is shown of an interval: avg, min, max, or delta
	// (the increase of a counter, as consumption per interval)
	Aggregate string `json:"aggregate,omitempty"`
	// Axis is left or right; empty chooses by unit
	Axis string `json:"axis,omitempty"`
}

var (
	charts     = map[string]bool{"": true, "line": true, "area": true, "bar": true, "step": true, "state": true}
	aggregates = map[string]bool{"": true, "avg": true, "min": true, "max": true, "delta": true}
	axes       = map[string]bool{"": true, "left": true, "right": true}
)

// SysvarAddress marks a series of a system variable
const SysvarAddress = "sysvar"

// Key names the series' recorded values
func (s Series) Key() string {
	return s.Address + "." + s.Datapoint
}

// Diagram is a set of series shown together
type Diagram struct {
	ID     string   `json:"id"`
	Name   string   `json:"name"`
	Series []Series `json:"series"`
	// Period is the range shown first: day, week, month or year
	Period string `json:"period,omitempty"`
	// Places are the rooms, trades and favorite lists (ReGa ids) that show
	// the diagram as a tile
	Places []int64 `json:"places,omitempty"`
}

// MaxPlaces limits the places of one diagram
const MaxPlaces = 50

// MaxSeries limits the series of one diagram
const MaxSeries = 12

var (
	ErrNotFound = errors.New("diagram not found")
	ErrInvalid  = errors.New("invalid diagram")
)

var (
	addressRegex   = regexp.MustCompile(`^[A-Za-z0-9_-]+(:\d+)?$`)
	datapointRegex = regexp.MustCompile(`^[A-Za-z0-9_]+$`)
	colorRegex     = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
)

// Validate checks a diagram before it is saved
func (d *Diagram) Validate() error {
	d.Name = strings.TrimSpace(d.Name)
	if d.Name == "" || len(d.Name) > 100 {
		return fmt.Errorf("%w: name", ErrInvalid)
	}
	if len(d.Series) == 0 || len(d.Series) > MaxSeries {
		return fmt.Errorf("%w: 1 to %d series", ErrInvalid, MaxSeries)
	}
	switch d.Period {
	case "", "day", "week", "month", "year":
	default:
		return fmt.Errorf("%w: period", ErrInvalid)
	}
	if len(d.Places) > MaxPlaces {
		return fmt.Errorf("%w: places", ErrInvalid)
	}
	for _, place := range d.Places {
		if place <= 0 {
			return fmt.Errorf("%w: place %d", ErrInvalid, place)
		}
	}
	seen := map[string]bool{}
	for i := range d.Series {
		s := &d.Series[i]
		s.Label = strings.TrimSpace(s.Label)
		if !addressRegex.MatchString(s.Address) || !datapointRegex.MatchString(s.Datapoint) ||
			(s.Color != "" && !colorRegex.MatchString(s.Color)) || len(s.Label) > 100 || len(s.Unit) > 20 ||
			!charts[s.Chart] || !aggregates[s.Aggregate] || !axes[s.Axis] {
			return fmt.Errorf("%w: series %d", ErrInvalid, i+1)
		}
		if seen[s.Key()] {
			return fmt.Errorf("%w: series %s twice", ErrInvalid, s.Key())
		}
		seen[s.Key()] = true
	}
	return nil
}

// Store keeps the diagrams in a JSON file
type Store struct {
	path     string
	mu       sync.Mutex
	diagrams []Diagram
}

// OpenStore reads the diagrams; a missing file means none
func OpenStore(path string) (*Store, error) {
	s := &Store{path: path, diagrams: []Diagram{}}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(data, &s.diagrams); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return s, nil
}

// List returns all diagrams
func (s *Store) List() []Diagram {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Diagram{}, s.diagrams...)
}

// Get returns a diagram
func (s *Store) Get(id string) (Diagram, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, d := range s.diagrams {
		if d.ID == id {
			return d, true
		}
	}
	return Diagram{}, false
}

// Keys returns the keys of all series of all diagrams
func (s *Store) Keys() map[string]bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	keys := map[string]bool{}
	for _, d := range s.diagrams {
		for _, series := range d.Series {
			keys[series.Key()] = true
		}
	}
	return keys
}

// Save adds a diagram (empty ID) or replaces one, and returns it with the
// previous version (nil for a new one)
func (s *Store) Save(d Diagram) (saved Diagram, previous *Diagram, err error) {
	if err := d.Validate(); err != nil {
		return Diagram{}, nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	next := append([]Diagram{}, s.diagrams...)
	if d.ID == "" {
		d.ID = newID()
		next = append(next, d)
	} else {
		found := false
		for i := range next {
			if next[i].ID == d.ID {
				old := next[i]
				previous = &old
				next[i] = d
				found = true
			}
		}
		if !found {
			return Diagram{}, nil, ErrNotFound
		}
	}
	if err := s.write(next); err != nil {
		return Diagram{}, nil, err
	}
	s.diagrams = next
	return d, previous, nil
}

// Delete removes a diagram and returns it
func (s *Store) Delete(id string) (Diagram, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, d := range s.diagrams {
		if d.ID == id {
			next := append(append([]Diagram{}, s.diagrams[:i]...), s.diagrams[i+1:]...)
			if err := s.write(next); err != nil {
				return Diagram{}, err
			}
			s.diagrams = next
			return d, nil
		}
	}
	return Diagram{}, ErrNotFound
}

func (s *Store) write(diagrams []Diagram) error {
	data, err := json.MarshalIndent(diagrams, "", "  ")
	if err != nil {
		return err
	}
	if dir := filepath.Dir(s.path); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

func newID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
