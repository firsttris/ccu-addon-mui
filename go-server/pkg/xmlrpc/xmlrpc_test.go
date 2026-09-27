package xmlrpc

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kolo/xmlrpc"

	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/types"
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

func TestUnregisterSendsCallbackURL(t *testing.T) {
	var body string
	ccu := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		body = string(b)
		_, _ = io.WriteString(w, `<?xml version="1.0"?><methodResponse><params><param><value><string></string></value></param></params></methodResponse>`)
	}))
	defer ccu.Close()

	client, err := xmlrpc.NewClient(ccu.URL, nil)
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	s := NewServer(&config.Config{CallbackHost: "127.0.0.1", RPCServerPort: 9099}, nil)
	s.clients["HmIP-RF"] = client

	if err := s.Unregister(context.Background()); err != nil {
		t.Fatalf("Unregister returned error: %v", err)
	}

	if !strings.Contains(body, "<methodName>init</methodName>") {
		t.Fatalf("expected init call, got %s", body)
	}
	if !strings.Contains(body, "http://127.0.0.1:9099") {
		t.Fatalf("expected callback URL in unregister call, got %s", body)
	}
}

func TestMulticallDeliversEventsInOrder(t *testing.T) {
	var got []interface{}
	s := NewServer(&config.Config{}, func(e *types.CCUEvent) {
		got = append(got, e.Event.Value)
	})

	var events strings.Builder
	for _, v := range []string{"0.1", "0.2", "0.3", "0.4", "0.5", "0.6", "0.7", "0.8", "0.9", "1.0"} {
		events.WriteString(`<value><struct>
<member><name>methodName</name><value>event</value></member>
<member><name>params</name><value><array><data>
<value>HmIP-RF</value><value>000A:4</value><value>LEVEL</value><value><double>` + v + `</double></value>
</data></array></value></member>
</struct></value>`)
	}
	body := `<?xml version="1.0"?><methodCall><methodName>system.multicall</methodName><params><param><value><array><data>` +
		events.String() + `</data></array></value></param></params></methodCall>`

	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	s.handleXMLRPC(httptest.NewRecorder(), req)

	if len(got) != 10 {
		t.Fatalf("expected 10 events, got %d", len(got))
	}
	for i, v := range got {
		if want := float64(i+1) / 10; v != want {
			t.Fatalf("event %d: expected %v, got %v (events out of order: %v)", i, want, v, got)
		}
	}
}
