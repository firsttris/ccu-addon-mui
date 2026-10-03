package auth

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// fakeCCU answers Session.login like the CCU WebUI for one valid user.
func fakeCCU(t *testing.T, logouts *int) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/homematic.cgi" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		var req struct {
			Method string            `json:"method"`
			Params map[string]string `json:"params"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		switch req.Method {
		case "Session.login":
			if req.Params["username"] == "Admin" && req.Params["password"] == "secret" {
				_, _ = w.Write([]byte(`{"version":"1.1","result":"abc123","error":null}`))
				return
			}
			_, _ = w.Write([]byte(`{"version":"1.1","result":null,"error":{"name":"JSONRPCError","code":501,"message":"invalid credentials or too many sessions"}}`))
		case "Session.logout":
			*logouts++
			_, _ = w.Write([]byte(`{"version":"1.1","result":true,"error":null}`))
		}
	}))
}

func newTestAuthenticator(t *testing.T, url string) *Authenticator {
	a, err := New(url, filepath.Join(t.TempDir(), "key"))
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func TestLoginIssuesVerifiableTokenAndLogsOutOfCCU(t *testing.T) {
	logouts := 0
	ccu := fakeCCU(t, &logouts)
	defer ccu.Close()
	a := newTestAuthenticator(t, ccu.URL)

	_, token, err := a.Login("Admin", "secret")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if logouts != 1 {
		t.Fatalf("expected the CCU session to be closed, got %d logouts", logouts)
	}
	session, err := a.Verify(token)
	if err != nil || session.User != "Admin" {
		t.Fatalf("Verify = %+v, %v", session, err)
	}
}

func TestLoginRejectsWrongPassword(t *testing.T) {
	logouts := 0
	ccu := fakeCCU(t, &logouts)
	defer ccu.Close()
	a := newTestAuthenticator(t, ccu.URL)

	if _, _, err := a.Login("Admin", "wrong"); err != ErrInvalidCredentials {
		t.Fatalf("expected ErrInvalidCredentials, got %v", err)
	}
}

func TestLoginLocksOutAfterRepeatedFailures(t *testing.T) {
	logouts := 0
	ccu := fakeCCU(t, &logouts)
	defer ccu.Close()
	a := newTestAuthenticator(t, ccu.URL)
	now := time.Now()
	a.now = func() time.Time { return now }

	for i := 0; i < maxFailures; i++ {
		_, _, _ = a.Login("Admin", "wrong")
	}
	// Even the right password is refused during the lockout
	if _, _, err := a.Login("Admin", "secret"); err != ErrTooManyAttempts {
		t.Fatalf("expected ErrTooManyAttempts, got %v", err)
	}

	now = now.Add(lockoutDuration + time.Second)
	if _, _, err := a.Login("Admin", "secret"); err != nil {
		t.Fatalf("expected login to work after the lockout, got %v", err)
	}
}

func TestVerifyRejectsTamperedAndExpiredTokens(t *testing.T) {
	a := newTestAuthenticator(t, "http://unused")
	now := time.Now()
	a.now = func() time.Time { return now }
	token := a.issueToken(Session{User: "Admin"})

	payload, signature, _ := strings.Cut(token, ".")
	other := a.issueToken(Session{User: "Gast"})
	otherPayload, _, _ := strings.Cut(other, ".")

	for name, bad := range map[string]string{
		"empty":           "",
		"no signature":    payload,
		"wrong signature": payload + "." + signature[:len(signature)-2] + "xx",
		"swapped payload": otherPayload + "." + signature,
	} {
		if _, err := a.Verify(bad); err != ErrInvalidToken {
			t.Fatalf("%s: expected ErrInvalidToken, got %v", name, err)
		}
	}

	now = now.Add(tokenLifetime + time.Hour)
	if _, err := a.Verify(token); err != ErrInvalidToken {
		t.Fatalf("expired: expected ErrInvalidToken, got %v", err)
	}
}

func TestRefreshExtendsLifetime(t *testing.T) {
	a := newTestAuthenticator(t, "http://unused")
	now := time.Now()
	a.now = func() time.Time { return now }
	token := a.issueToken(Session{User: "Admin"})

	now = now.Add(tokenLifetime - time.Hour)
	_, refreshed, err := a.Refresh(token)
	if err != nil {
		t.Fatal(err)
	}

	now = now.Add(2 * time.Hour) // the old token has expired by now
	if _, err := a.Verify(token); err == nil {
		t.Fatal("expected the old token to be expired")
	}
	if _, err := a.Verify(refreshed); err != nil {
		t.Fatalf("expected the refreshed token to be valid: %v", err)
	}
}

func TestKeyIsPersistedAcrossRestarts(t *testing.T) {
	keyFile := filepath.Join(t.TempDir(), "key")
	a1, err := New("http://unused", keyFile)
	if err != nil {
		t.Fatal(err)
	}
	token := a1.issueToken(Session{User: "Admin"})

	a2, err := New("http://unused", keyFile)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a2.Verify(token); err != nil {
		t.Fatalf("token must stay valid after a restart: %v", err)
	}
	info, _ := os.Stat(keyFile)
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("expected key file mode 0600, got %v", info.Mode().Perm())
	}
}

func TestLoginStoresUserLevelInToken(t *testing.T) {
	logouts := 0
	ccu := fakeCCU(t, &logouts)
	defer ccu.Close()
	a := newTestAuthenticator(t, ccu.URL)
	a.SetLevelFunc(func(username string) (string, error) {
		if username != "Admin" {
			t.Errorf("level looked up for %q", username)
		}
		return LevelAdmin, nil
	})

	session, token, err := a.Login("Admin", "secret")
	if err != nil || session.Level != LevelAdmin {
		t.Fatalf("Login = %+v, %v", session, err)
	}
	verified, err := a.Verify(token)
	if err != nil || verified.User != "Admin" || verified.Level != LevelAdmin || verified.Scope != ScopeOperate {
		t.Fatalf("Verify = %+v, %v", verified, err)
	}
}

func TestLoginSucceedsWhenLevelLookupFails(t *testing.T) {
	logouts := 0
	ccu := fakeCCU(t, &logouts)
	defer ccu.Close()
	a := newTestAuthenticator(t, ccu.URL)
	a.SetLevelFunc(func(string) (string, error) { return "", errors.New("rega down") })

	session, _, err := a.Login("Admin", "secret")
	if err != nil || session.Level != LevelUnknown {
		t.Fatalf("Login = %+v, %v", session, err)
	}
}

func TestRefreshKeepsLevelAndFillsInMissingOne(t *testing.T) {
	a := newTestAuthenticator(t, "http://unused")
	lookups := 0
	a.SetLevelFunc(func(string) (string, error) {
		lookups++
		return LevelUser, nil
	})

	// A token with a level keeps it without a new lookup
	session, _, err := a.Refresh(a.issueToken(Session{User: "Admin", Level: LevelAdmin}))
	if err != nil || session.Level != LevelAdmin || lookups != 0 {
		t.Fatalf("Refresh = %+v, %v (%d lookups)", session, err, lookups)
	}

	// A token from before levels were stored gets one
	session, refreshed, err := a.Refresh(a.issueToken(Session{User: "Gast"}))
	if err != nil || session.Level != LevelUser || lookups != 1 {
		t.Fatalf("Refresh = %+v, %v (%d lookups)", session, err, lookups)
	}
	if verified, _ := a.Verify(refreshed); verified.Level != LevelUser {
		t.Fatalf("refreshed token has level %q", verified.Level)
	}
}

func TestLevelFromCCU(t *testing.T) {
	for level, want := range map[int]string{8: LevelAdmin, 2: LevelUser, 1: LevelGuest, 0: LevelUnknown, 4: LevelUnknown} {
		if got := LevelFromCCU(level); got != want {
			t.Errorf("LevelFromCCU(%d) = %q, want %q", level, got, want)
		}
	}
}

func TestAdminTokens(t *testing.T) {
	logouts := 0
	ccu := fakeCCU(t, &logouts)
	defer ccu.Close()
	a := newTestAuthenticator(t, ccu.URL)
	now := time.Now()
	a.now = func() time.Time { return now }
	a.SetLevelFunc(func(string) (string, error) { return LevelAdmin, nil })

	if _, err := a.IssueAdminToken(Session{User: "Gast", Level: LevelGuest}); err != ErrNotAdmin {
		t.Fatalf("expected ErrNotAdmin, got %v", err)
	}

	token, err := a.Elevate("Admin", "secret")
	if err != nil {
		t.Fatal(err)
	}
	expiry, ok := a.VerifyAdmin(token, "Admin")
	if _, other := a.VerifyAdmin(token, "Other"); !ok || other {
		t.Fatal("admin token must be valid for its user only")
	}
	if expiry.Unix() != now.Add(adminTokenLifetime).Unix() {
		t.Fatalf("unexpected expiry %v", expiry)
	}
	// An operating token is no admin token, and an admin token can't be renewed
	if _, ok := a.VerifyAdmin(a.issueToken(Session{User: "Admin", Level: LevelAdmin}), "Admin"); ok {
		t.Fatal("operating token accepted as admin token")
	}
	if _, _, err := a.Refresh(token); err != ErrInvalidToken {
		t.Fatalf("admin token must not be renewed, got %v", err)
	}

	now = now.Add(adminTokenLifetime + time.Minute)
	if _, ok := a.VerifyAdmin(token, "Admin"); ok {
		t.Fatal("admin token must expire")
	}

	if _, err := a.Elevate("Admin", "wrong"); err != ErrInvalidCredentials {
		t.Fatalf("expected ErrInvalidCredentials, got %v", err)
	}
}
