package auth

import (
	"path/filepath"
	"testing"
	"time"
)

func TestSessionsCanBeRevoked(t *testing.T) {
	logouts := 0
	ccu := fakeCCU(t, &logouts)
	defer ccu.Close()
	dir := t.TempDir()
	a := newTestAuthenticator(t, ccu.URL)
	a.SetLevelFunc(func(string) (string, error) { return LevelAdmin, nil })
	if err := a.EnableSessions(filepath.Join(dir, "sessions.json")); err != nil {
		t.Fatal(err)
	}

	session, tablet, err := a.Login("Admin", "secret", "Wandtablet", "192.0.2.1")
	if err != nil || session.ID == "" {
		t.Fatalf("Login = %+v, %v", session, err)
	}
	_, phone, _ := a.Login("Admin", "secret", "Handy", "192.0.2.1")
	adminToken, err := a.IssueAdminToken(session)
	if err != nil {
		t.Fatal(err)
	}

	sessions := a.Sessions()
	if len(sessions) != 2 {
		t.Fatalf("expected 2 sessions, got %+v", sessions)
	}

	if !a.Revoke(session.ID) {
		t.Fatal("revoke failed")
	}
	if _, _, err := a.Refresh(tablet, "Wandtablet"); err != ErrInvalidToken {
		t.Fatalf("revoked token must not work, got %v", err)
	}
	if _, ok := a.VerifyAdmin(adminToken, "Admin"); ok {
		t.Fatal("the admin token of a revoked device must not work")
	}
	if _, _, err := a.Refresh(phone, "Handy"); err != nil {
		t.Fatalf("other devices stay logged in: %v", err)
	}

	// Kept across a restart
	b := newTestAuthenticator(t, ccu.URL)
	b.key = a.key
	if err := b.EnableSessions(filepath.Join(dir, "sessions.json")); err != nil {
		t.Fatal(err)
	}
	if list := b.Sessions(); len(list) != 1 || list[0].Device != "Handy" {
		t.Fatalf("unexpected sessions after restart: %+v", list)
	}
	if _, _, err := b.Refresh(tablet, "Wandtablet"); err != ErrInvalidToken {
		t.Fatalf("revocation must survive a restart, got %v", err)
	}
}

func TestLegacyTokensGetASession(t *testing.T) {
	a := newTestAuthenticator(t, "http://unused")
	legacy := a.issueToken(Session{User: "Admin"})
	if err := a.EnableSessions(filepath.Join(t.TempDir(), "sessions.json")); err != nil {
		t.Fatal(err)
	}

	session, renewed, err := a.Refresh(legacy, "Altes Tablet")
	if err != nil || session.ID == "" {
		t.Fatalf("Refresh = %+v, %v", session, err)
	}
	if list := a.Sessions(); len(list) != 1 || list[0].Device != "Altes Tablet" {
		t.Fatalf("unexpected sessions: %+v", list)
	}
	// The renewed token carries the id and can be revoked
	a.Revoke(session.ID)
	if _, _, err := a.Refresh(renewed, "Altes Tablet"); err != ErrInvalidToken {
		t.Fatalf("expected the renewed token to be revoked, got %v", err)
	}
}

func TestLastUsedIsUpdatedHourly(t *testing.T) {
	a := newTestAuthenticator(t, "http://unused")
	now := time.Date(2026, 1, 1, 8, 0, 0, 0, time.UTC)
	a.now = func() time.Time { return now }
	if err := a.EnableSessions(filepath.Join(t.TempDir(), "sessions.json")); err != nil {
		t.Fatal(err)
	}
	_, token, _ := a.Refresh(a.issueToken(Session{User: "Admin"}), "Tablet")

	now = now.Add(10 * time.Minute)
	_, token, _ = a.Refresh(token, "Tablet")
	if got := a.Sessions()[0].LastUsed; !got.Equal(time.Date(2026, 1, 1, 8, 0, 0, 0, time.UTC)) {
		t.Fatalf("lastUsed must not move within the hour, got %v", got)
	}
	now = now.Add(2 * time.Hour)
	_, _, _ = a.Refresh(token, "Tablet")
	if got := a.Sessions()[0].LastUsed; !got.Equal(now) {
		t.Fatalf("expected lastUsed %v, got %v", now, got)
	}
}
