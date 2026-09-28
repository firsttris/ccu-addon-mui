package auth

import (
	"encoding/json"
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

	token, err := a.Login("Admin", "secret")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if logouts != 1 {
		t.Fatalf("expected the CCU session to be closed, got %d logouts", logouts)
	}
	user, err := a.Verify(token)
	if err != nil || user != "Admin" {
		t.Fatalf("Verify = %q, %v", user, err)
	}
}

func TestLoginRejectsWrongPassword(t *testing.T) {
	logouts := 0
	ccu := fakeCCU(t, &logouts)
	defer ccu.Close()
	a := newTestAuthenticator(t, ccu.URL)

	if _, err := a.Login("Admin", "wrong"); err != ErrInvalidCredentials {
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
		_, _ = a.Login("Admin", "wrong")
	}
	// Even the right password is refused during the lockout
	if _, err := a.Login("Admin", "secret"); err != ErrTooManyAttempts {
		t.Fatalf("expected ErrTooManyAttempts, got %v", err)
	}

	now = now.Add(lockoutDuration + time.Second)
	if _, err := a.Login("Admin", "secret"); err != nil {
		t.Fatalf("expected login to work after the lockout, got %v", err)
	}
}

func TestVerifyRejectsTamperedAndExpiredTokens(t *testing.T) {
	a := newTestAuthenticator(t, "http://unused")
	now := time.Now()
	a.now = func() time.Time { return now }
	token := a.issueToken("Admin")

	payload, signature, _ := strings.Cut(token, ".")
	other := a.issueToken("Gast")
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
	token := a.issueToken("Admin")

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
	token := a1.issueToken("Admin")

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
