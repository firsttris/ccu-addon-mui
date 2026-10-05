package push

import (
	"encoding/json"
	"errors"
	"os"
	"sync"
	"time"
)

// Entry is a device that receives notifications.
type Entry struct {
	Subscription Subscription `json:"subscription"`
	User         string       `json:"user,omitempty"`
	Device       string       `json:"device,omitempty"`
	// "de" or "en", for the texts
	Language string `json:"language,omitempty"`
	// What to notify about
	Alarms  bool `json:"alarms"`
	Service bool `json:"service"`
	// Notification rules (package rules)
	Rules   bool      `json:"rules,omitempty"`
	Created time.Time `json:"created"`
}

type storeData struct {
	// The VAPID private key (base64url), created on the first start
	VAPIDKey      string  `json:"vapidKey"`
	Subscriptions []Entry `json:"subscriptions"`
}

// Store keeps the VAPID key and the subscriptions in a file.
type Store struct {
	path string
	mu   sync.Mutex
	data storeData
}

func OpenStore(path string) (*Store, error) {
	s := &Store{path: path}
	raw, err := os.ReadFile(path)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &s.data); err != nil {
			return nil, err
		}
	}
	return s, nil
}

func (s *Store) saveLocked() error {
	raw, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	// Written aside and renamed, as rules.go and diagrams.go do: a power cut
	// mid-write would otherwise leave a broken file, and with it a new VAPID
	// key, which makes every browser's subscription useless.
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// VAPID returns the key, creating and storing one the first time.
func (s *Store) VAPID(subject string) (*VAPID, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	v, err := NewVAPID(s.data.VAPIDKey, subject)
	if err != nil {
		return nil, err
	}
	if s.data.VAPIDKey == "" {
		s.data.VAPIDKey = encodeKey(v.privateBytes())
		if err := s.saveLocked(); err != nil {
			return nil, err
		}
	}
	return v, nil
}

// Put adds or replaces a subscription (by endpoint).
func (s *Store) Put(e Entry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.removeLocked(e.Subscription.Endpoint)
	s.data.Subscriptions = append(s.data.Subscriptions, e)
	return s.saveLocked()
}

func (s *Store) removeLocked(endpoint string) bool {
	for i, e := range s.data.Subscriptions {
		if e.Subscription.Endpoint == endpoint {
			s.data.Subscriptions = append(s.data.Subscriptions[:i], s.data.Subscriptions[i+1:]...)
			return true
		}
	}
	return false
}

// Remove drops a subscription; true if there was one.
func (s *Store) Remove(endpoint string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.removeLocked(endpoint) {
		return false, nil
	}
	return true, s.saveLocked()
}

// Get returns the subscription of an endpoint.
func (s *Store) Get(endpoint string) (Entry, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, e := range s.data.Subscriptions {
		if e.Subscription.Endpoint == endpoint {
			return e, true
		}
	}
	return Entry{}, false
}

// All returns a copy of the subscriptions.
func (s *Store) All() []Entry {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Entry(nil), s.data.Subscriptions...)
}
