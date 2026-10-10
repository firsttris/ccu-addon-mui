package auth

import (
	"crypto/rand"
	"encoding/hex"
	"slices"
	"time"

	"ccu-addon-mui-server/pkg/atomicfile"
)

// SessionInfo is a logged-in device: every token belongs to one, so a
// device can be logged out (its tokens revoked) without changing the key.
type SessionInfo struct {
	ID       string    `json:"id"`
	User     string    `json:"user"`
	Device   string    `json:"device"`
	Created  time.Time `json:"created"`
	LastUsed time.Time `json:"lastUsed"`
	// AdminNotBefore: admin tokens of the device issued up to then no
	// longer work (EndElevation); its login stays valid. Only kept in the
	// file, Sessions leaves it out.
	AdminNotBefore *time.Time `json:"adminNotBefore,omitempty"`
	// Logged in by the CCU's automatic login, without a password
	Auto bool `json:"auto,omitempty"`
}

const (
	maxSessions = 100
	// Automatic logins need no password, so anyone who can reach the
	// add-on can start one: they have their own, smaller share and never
	// push out a device that logged in with a password
	maxAutoSessions = 20
	// LastUsed is only written to the file when it moved by this much: the
	// CCU's flash shouldn't be written on every connect.
	lastUsedResolution = time.Hour
)

type sessionStore struct {
	path     string
	sessions map[string]*SessionInfo
}

// EnableSessions keeps track of logged-in devices in path. Without it,
// tokens can only be revoked all at once by replacing the key.
func (a *Authenticator) EnableSessions(path string) error {
	store := &sessionStore{path: path, sessions: map[string]*SessionInfo{}}
	var list []*SessionInfo
	if err := atomicfile.ReadJSON(path, &list); err != nil {
		return err
	}
	for _, s := range list {
		store.sessions[s.ID] = s
	}
	a.mu.Lock()
	a.store = store
	a.mu.Unlock()
	return nil
}

func newSessionID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// save writes the sessions; a.mu must be held.
func (s *sessionStore) save() error {
	list := make([]*SessionInfo, 0, len(s.sessions))
	for _, session := range s.sessions {
		list = append(list, session)
	}
	slices.SortFunc(list, func(a, b *SessionInfo) int { return a.Created.Compare(b.Created) })
	return atomicfile.WriteJSON(s.path, list, 0o600)
}

// startSession registers a new device; a.mu must be held. auto: by the
// automatic login.
func (a *Authenticator) startSession(user, device string, auto bool) string {
	if a.store == nil {
		return ""
	}
	now := a.now()
	if auto {
		// The same device again: its session, without writing the file
		autoCount := 0
		for _, s := range a.store.sessions {
			if s.Auto {
				if s.User == user && s.Device == device {
					s.LastUsed = now
					return s.ID
				}
				autoCount++
			}
		}
		if autoCount >= maxAutoSessions {
			a.evictOldest(func(s *SessionInfo) bool { return s.Auto })
		}
	}
	// Forget the longest unused device when there are too many
	if len(a.store.sessions) >= maxSessions {
		a.evictOldest(func(*SessionInfo) bool { return true })
	}
	id := newSessionID()
	a.store.sessions[id] = &SessionInfo{ID: id, User: user, Device: device, Created: now, LastUsed: now, Auto: auto}
	_ = a.store.save()
	return id
}

// evictOldest forgets the longest unused of the sessions that match; a.mu
// must be held.
func (a *Authenticator) evictOldest(match func(*SessionInfo) bool) {
	var oldest *SessionInfo
	for _, s := range a.store.sessions {
		if match(s) && (oldest == nil || s.LastUsed.Before(oldest.LastUsed)) {
			oldest = s
		}
	}
	if oldest == nil {
		return
	}
	delete(a.store.sessions, oldest.ID)
	if a.evicted != nil {
		go a.evicted(oldest.ID)
	}
}

// checkSession reports whether a token's session is still valid and notes
// its use. Tokens from before sessions existed (no id) get one.
func (a *Authenticator) checkSession(session *Session, device string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.store == nil {
		return true
	}
	if session.ID == "" {
		session.ID = a.startSession(session.User, device, false)
		return true
	}
	info, ok := a.store.sessions[session.ID]
	if !ok || info.User != session.User {
		return false
	}
	now := a.now()
	if now.Sub(info.LastUsed) >= lastUsedResolution {
		info.LastUsed = now
		_ = a.store.save()
	}
	return true
}

// Sessions lists the logged-in devices, most recently used first.
func (a *Authenticator) Sessions() []SessionInfo {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.store == nil {
		return nil
	}
	list := make([]SessionInfo, 0, len(a.store.sessions))
	for _, s := range a.store.sessions {
		info := *s
		info.AdminNotBefore = nil
		list = append(list, info)
	}
	slices.SortFunc(list, func(a, b SessionInfo) int { return b.LastUsed.Compare(a.LastUsed) })
	return list
}

// OnEvict sets what happens with a device that is logged out because a new
// one needs its place: its open connections are closed.
func (a *Authenticator) OnEvict(f func(id string)) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.evicted = f
}

// Revoke logs a device out: its tokens stop working.
func (a *Authenticator) Revoke(id string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.store == nil {
		return false
	}
	if _, ok := a.store.sessions[id]; !ok {
		return false
	}
	delete(a.store.sessions, id)
	_ = a.store.save()
	return true
}

// EndElevation gives up the admin rights of a device before its admin
// token expires: admin tokens issued so far stop working, the device stays
// logged in.
func (a *Authenticator) EndElevation(id string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.store == nil {
		return false
	}
	info, ok := a.store.sessions[id]
	if !ok {
		return false
	}
	now := a.now()
	info.AdminNotBefore = &now
	_ = a.store.save()
	return true
}

// elevationEnded reports whether an admin token was issued before its
// device gave up the admin rights.
func (a *Authenticator) elevationEnded(session Session) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.store == nil {
		return false
	}
	info, ok := a.store.sessions[session.ID]
	return ok && info.AdminNotBefore != nil && !session.IssuedAt.After(*info.AdminNotBefore)
}
