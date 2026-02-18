package xmlrpc

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestExtractValue(t *testing.T) {
	s := &Server{}

	str := "hello"
	if got := s.extractValue(&value{String: &str}); got != "hello" {
		t.Fatalf("expected string value hello, got %#v", got)
	}

	i := 42
	if got := s.extractValue(&value{Int: &i}); got != 42 {
		t.Fatalf("expected int value 42, got %#v", got)
	}

	bTrue := 1
	if got := s.extractValue(&value{Boolean: &bTrue}); got != true {
		t.Fatalf("expected boolean true, got %#v", got)
	}

	bFalse := 0
	if got := s.extractValue(&value{Boolean: &bFalse}); got != false {
		t.Fatalf("expected boolean false, got %#v", got)
	}

	if got := s.extractValue(&value{Text: "plain"}); got != "plain" {
		t.Fatalf("expected text fallback plain, got %#v", got)
	}

	if got := s.extractValue(&value{}); got != nil {
		t.Fatalf("expected nil for empty value, got %#v", got)
	}
}

func TestHandleXMLRPCMethodNotAllowed(t *testing.T) {
	s := &Server{}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()

	s.handleXMLRPC(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected status %d, got %d", http.StatusMethodNotAllowed, w.Code)
	}
}

func TestHandleXMLRPCSystemListMethods(t *testing.T) {
	s := &Server{}

	body := `<?xml version="1.0"?><methodCall><methodName>system.listMethods</methodName><params></params></methodCall>`
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	req.Header.Set("Content-Type", "text/xml")
	w := httptest.NewRecorder()

	s.handleXMLRPC(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, w.Code)
	}
	if contentType := w.Header().Get("Content-Type"); contentType != "text/xml" {
		t.Fatalf("expected Content-Type text/xml, got %q", contentType)
	}

	responseBody := w.Body.String()
	for _, expected := range []string{"system.listMethods", "system.multicall", "listDevices", "init", "event"} {
		if !strings.Contains(responseBody, expected) {
			t.Fatalf("expected response to include %q, got %s", expected, responseBody)
		}
	}
}
