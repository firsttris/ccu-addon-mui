// Package rules notifies about states of devices without a CCU program:
// "window open for 15 minutes", "water detected", "door opened at night".
//
// The WebUI has nothing like it; there a program with a delay and a system
// variable or e-mail add-on does the job. Here a rule watches the values the
// CCU sends as events (the same XML-RPC events the app shows) and sends a
// push notification once all its conditions hold long enough.
package rules

import (
	"ccu-addon-mui-server/pkg/atomicfile"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"sync"
)

// Condition compares a channel's datapoint with a value. Booleans count as
// 1 and 0, enums by their index, as the CCU sends them.
type Condition struct {
	// ReGa id of the channel, for the app's channel choice
	ChannelID     int64   `json:"channelId,omitempty"`
	InterfaceName string  `json:"interfaceName"`
	Address       string  `json:"address"`
	Datapoint     string  `json:"datapoint"`
	Op            string  `json:"op"`
	Value         float64 `json:"value"`
}

// Key names the condition's datapoint as the events do
func (c Condition) Key() string {
	return c.Address + "." + c.Datapoint
}

// Rule notifies when all its conditions hold for Minutes, inside the time
// window if it has one.
type Rule struct {
	ID         string      `json:"id"`
	Name       string      `json:"name"`
	Enabled    bool        `json:"enabled"`
	Conditions []Condition `json:"conditions"`
	// How long the conditions must hold; 0 notifies at once
	Minutes int `json:"minutes"`
	// "HH:MM" local time; the window may pass midnight (22:00 to 06:00)
	From string `json:"from,omitempty"`
	To   string `json:"to,omitempty"`
	// The text of the notification: Message if set, else Summary, the
	// conditions in words as the app wrote them
	Message string `json:"message"`
	Summary string `json:"summary,omitempty"`
}

// Text is the body of the rule's notification
func (r Rule) Text() string {
	if r.Message != "" {
		return r.Message
	}
	return r.Summary
}

// Limits of a rule
const (
	MaxConditions = 5
	MaxMinutes    = 7 * 24 * 60
	MaxRules      = 100
)

var (
	ErrNotFound = errors.New("rule not found")
	ErrInvalid  = errors.New("invalid rule")
)

var (
	addressRegex   = regexp.MustCompile(`^[A-Za-z0-9_-]+:\d+$`)
	datapointRegex = regexp.MustCompile(`^[A-Za-z0-9_]+$`)
	interfaceRegex = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
	clockRegex     = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)
	ops            = map[string]bool{"eq": true, "ne": true, "lt": true, "gt": true}
)

// Validate checks a rule before it is saved
func (r *Rule) Validate() error {
	r.Name = strings.TrimSpace(r.Name)
	r.Message = strings.TrimSpace(r.Message)
	r.Summary = strings.TrimSpace(r.Summary)
	if r.Name == "" || len(r.Name) > 100 {
		return fmt.Errorf("%w: name", ErrInvalid)
	}
	if len(r.Message) > 300 || len(r.Summary) > 500 {
		return fmt.Errorf("%w: message", ErrInvalid)
	}
	if len(r.Conditions) == 0 || len(r.Conditions) > MaxConditions {
		return fmt.Errorf("%w: 1 to %d conditions", ErrInvalid, MaxConditions)
	}
	if r.Minutes < 0 || r.Minutes > MaxMinutes {
		return fmt.Errorf("%w: minutes", ErrInvalid)
	}
	if (r.From == "") != (r.To == "") || (r.From != "" && (!clockRegex.MatchString(r.From) || !clockRegex.MatchString(r.To) || r.From == r.To)) {
		return fmt.Errorf("%w: time window", ErrInvalid)
	}
	for i, c := range r.Conditions {
		if !addressRegex.MatchString(c.Address) || !datapointRegex.MatchString(c.Datapoint) ||
			!interfaceRegex.MatchString(c.InterfaceName) || !ops[c.Op] {
			return fmt.Errorf("%w: condition %d", ErrInvalid, i+1)
		}
	}
	return nil
}

// Store keeps the rules in a JSON file
type Store struct {
	path  string
	mu    sync.Mutex
	rules []Rule
}

// OpenStore reads the rules; a missing file means none
func OpenStore(path string) (*Store, error) {
	s := &Store{path: path, rules: []Rule{}}
	if err := atomicfile.ReadJSON(path, &s.rules); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return s, nil
}

// List returns all rules
func (s *Store) List() []Rule {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Rule{}, s.rules...)
}

// Save adds a rule (empty ID) or replaces one, and returns it with the
// previous version (nil for a new one)
func (s *Store) Save(r Rule) (saved Rule, previous *Rule, err error) {
	if err := r.Validate(); err != nil {
		return Rule{}, nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	next := append([]Rule{}, s.rules...)
	if r.ID == "" {
		if len(next) >= MaxRules {
			return Rule{}, nil, fmt.Errorf("%w: at most %d rules", ErrInvalid, MaxRules)
		}
		r.ID = newID()
		next = append(next, r)
	} else {
		found := false
		for i := range next {
			if next[i].ID == r.ID {
				old := next[i]
				previous = &old
				next[i] = r
				found = true
			}
		}
		if !found {
			return Rule{}, nil, ErrNotFound
		}
	}
	if err := s.write(next); err != nil {
		return Rule{}, nil, err
	}
	s.rules = next
	return r, previous, nil
}

// Delete removes a rule and returns it
func (s *Store) Delete(id string) (Rule, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, r := range s.rules {
		if r.ID == id {
			next := append(append([]Rule{}, s.rules[:i]...), s.rules[i+1:]...)
			if err := s.write(next); err != nil {
				return Rule{}, err
			}
			s.rules = next
			return r, nil
		}
	}
	return Rule{}, ErrNotFound
}

func (s *Store) write(rules []Rule) error {
	return atomicfile.WriteJSON(s.path, rules, 0o600)
}

func newID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
