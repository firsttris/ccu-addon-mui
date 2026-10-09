package backup

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAdminCallTellsAnExpiredSessionFromAFailedMethod(t *testing.T) {
	ccu := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct{ Method string }
		_ = json.NewDecoder(r.Body).Decode(&request)
		switch request.Method {
		case "Session.login":
			_, _ = io.WriteString(w, `{"result":"session-1","error":null}`)
		case "Expired.method":
			_, _ = io.WriteString(w, `{"result":null,"error":{"code":400,"message":"access denied"}}`)
		default:
			_, _ = io.WriteString(w, `{"result":null,"error":{"code":501,"message":"no such gateway"}}`)
		}
	}))
	defer ccu.Close()
	s := New(ccu.URL, t.TempDir(), "")
	if _, err := s.groupSession("Admin", "secret"); err != nil {
		t.Fatal(err)
	}

	// A failing method keeps the session and tells why
	if _, err := s.AdminCall("Admin", "", "Failing.method", nil); err == nil || errors.Is(err, ErrSessionRequired) || !strings.Contains(err.Error(), "no such gateway") {
		t.Fatalf("got %v", err)
	}
	if _, err := s.groupSession("Admin", ""); err != nil {
		t.Fatalf("session forgotten: %v", err)
	}

	// An expired one asks for the password
	if _, err := s.AdminCall("Admin", "", "Expired.method", nil); !errors.Is(err, ErrSessionRequired) {
		t.Fatalf("got %v", err)
	}
	if _, err := s.groupSession("Admin", ""); !errors.Is(err, ErrSessionRequired) {
		t.Fatal("expected the session to be forgotten")
	}
}
