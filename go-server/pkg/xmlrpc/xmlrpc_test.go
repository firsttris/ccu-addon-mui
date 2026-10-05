package xmlrpc

import (
	"context"
	"encoding/xml"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

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

// fakeCCU records the XML-RPC method names it receives and fails init
// until failInits calls have been made.
type fakeCCU struct {
	mu        sync.Mutex
	calls     []string
	failInits int
	// onPing, if set, answers a ping like the CCU (with a PONG event)
	onPing func(interfaceID string)
}

func (f *fakeCCU) handler(w http.ResponseWriter, r *http.Request) {
	b, _ := io.ReadAll(r.Body)
	var call methodCall
	_ = xml.Unmarshal(b, &call)

	f.mu.Lock()
	f.calls = append(f.calls, call.MethodName)
	fail := call.MethodName == "init" && f.failInits > 0
	if fail {
		f.failInits--
	}
	f.mu.Unlock()

	if fail {
		http.Error(w, "not ready", http.StatusServiceUnavailable)
		return
	}
	if call.MethodName == "ping" && f.onPing != nil && len(call.Params.Param) > 0 && call.Params.Param[0].Value.String != nil {
		go f.onPing(*call.Params.Param[0].Value.String)
	}
	_, _ = io.WriteString(w, `<?xml version="1.0"?><methodResponse><params><param><value><string></string></value></param></params></methodResponse>`)
}

func (f *fakeCCU) count(method string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	n := 0
	for _, c := range f.calls {
		if c == method {
			n++
		}
	}
	return n
}

func newTestServer(ccuURL string) *Server {
	u, _ := url.Parse(ccuURL)
	port, _ := strconv.Atoi(u.Port())
	s := NewServer(&config.Config{CCUHost: u.Hostname(), CallbackHost: "127.0.0.1", RPCServerPort: 9099, HmIPPort: port}, func(*types.CCUEvent) {})
	s.checkInterval = 10 * time.Millisecond
	s.initialBackoff = 10 * time.Millisecond
	s.maxBackoff = 20 * time.Millisecond
	return s
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestRegistrationRetriesInitUntilCCUIsReady(t *testing.T) {
	ccu := &fakeCCU{failInits: 3}
	ts := httptest.NewServer(http.HandlerFunc(ccu.handler))
	defer ts.Close()

	s := newTestServer(ts.URL)
	ctx, cancel := context.WithCancel(context.Background())
	s.startRegistration(ctx, "HmIP-RF", s.cfg.HmIPPort, "")

	waitFor(t, "successful init", func() bool { return ccu.count("init") >= 4 })

	cancel()
	if err := s.Unregister(context.Background()); err != nil {
		t.Fatalf("Unregister returned error: %v", err)
	}
}

func TestRegistrationPingsAndReinitsWhenCCUGoesQuiet(t *testing.T) {
	ccu := &fakeCCU{}
	ts := httptest.NewServer(http.HandlerFunc(ccu.handler))
	defer ts.Close()

	s := newTestServer(ts.URL)
	s.pingAfter = 30 * time.Millisecond
	s.pongTimeout = 20 * time.Millisecond
	s.reinitAfter = time.Hour

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.startRegistration(ctx, "HmIP-RF", s.cfg.HmIPPort, "")

	// The fake CCU never sends callbacks, so the server has to ping and,
	// without a PONG, register again (long before reinitAfter).
	waitFor(t, "ping", func() bool { return ccu.count("ping") >= 1 })
	waitFor(t, "re-init", func() bool { return ccu.count("init") >= 2 })
}

func TestRegistrationKeptWhenPingIsAnswered(t *testing.T) {
	ccu := &fakeCCU{}
	ts := httptest.NewServer(http.HandlerFunc(ccu.handler))
	defer ts.Close()

	s := newTestServer(ts.URL)
	s.pingAfter = 30 * time.Millisecond
	s.pongTimeout = 40 * time.Millisecond
	s.reinitAfter = time.Hour
	ccu.onPing = func(id string) { s.dispatchEvent([]interface{}{id, "CENTRAL", "PONG", id}) }

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.startRegistration(ctx, "HmIP-RF", s.cfg.HmIPPort, "")

	waitFor(t, "several pings", func() bool { return ccu.count("ping") >= 3 })
	if n := ccu.count("init"); n != 1 {
		t.Fatalf("expected no re-init while pings are answered, got %d init calls", n)
	}
}

func TestRegistrationStaysQuietWhileEventsArrive(t *testing.T) {
	ccu := &fakeCCU{}
	ts := httptest.NewServer(http.HandlerFunc(ccu.handler))
	defer ts.Close()

	s := newTestServer(ts.URL)
	s.pingAfter = 50 * time.Millisecond
	s.reinitAfter = 100 * time.Millisecond

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.startRegistration(ctx, "HmIP-RF", s.cfg.HmIPPort, "")
	waitFor(t, "init", func() bool { return ccu.count("init") == 1 })

	for i := 0; i < 30; i++ {
		s.dispatchEvent([]interface{}{"websocket-server-HmIP-RF", "000A:1", "STATE", true})
		time.Sleep(10 * time.Millisecond)
	}

	if n := ccu.count("init"); n != 1 {
		t.Fatalf("expected no re-init while events arrive, got %d init calls", n)
	}
	if n := ccu.count("ping"); n != 0 {
		t.Fatalf("expected no ping while events arrive, got %d", n)
	}
}

func TestHandleXMLRPCDirectEvent(t *testing.T) {
	var got *types.CCUEvent
	s := NewServer(&config.Config{}, func(e *types.CCUEvent) { got = e })

	body := `<?xml version="1.0"?><methodCall><methodName>event</methodName><params>
<param><value>websocket-server-HmIP-RF</value></param>
<param><value>000A:4</value></param>
<param><value>LEVEL</value></param>
<param><value><double>0.5</double></value></param>
</params></methodCall>`
	s.handleXMLRPC(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body)))

	if got == nil {
		t.Fatal("expected event to be dispatched")
	}
	if got.Event.Channel != "000A:4" || got.Event.Datapoint != "LEVEL" || got.Event.Value != 0.5 {
		t.Fatalf("unexpected event: %+v", got.Event)
	}
}

func TestHandleXMLRPCRejectsOversizedBody(t *testing.T) {
	s := NewServer(&config.Config{}, func(*types.CCUEvent) {})

	body := strings.Repeat("x", maxRequestBodySize+1)
	w := httptest.NewRecorder()
	s.handleXMLRPC(w, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body)))

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}
}

func TestExtractValueAdditionalTypes(t *testing.T) {
	s := &Server{}

	i8 := int64(1 << 40)
	if got := s.extractValue(&value{I8: &i8}); got != i8 {
		t.Fatalf("expected i8 value, got %#v", got)
	}

	dt := "20260927T12:00:00"
	if got := s.extractValue(&value{DateTime: &dt}); got != dt {
		t.Fatalf("expected dateTime value, got %#v", got)
	}

	if got := s.extractValue(&value{Array: &array{}, Text: "\n  \n"}); got != nil {
		t.Fatalf("expected nil for array value, got %#v", got)
	}
}

func TestBasicAuthTransportDoesNotModifyRequest(t *testing.T) {
	var gotUser string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUser, _, _ = r.BasicAuth()
	}))
	defer ts.Close()

	transport := &basicAuthTransport{username: "alice", password: "secret", base: http.DefaultTransport}
	req := httptest.NewRequest(http.MethodGet, ts.URL, nil)
	req.RequestURI = ""

	resp, err := transport.RoundTrip(req)
	if err != nil {
		t.Fatalf("RoundTrip returned error: %v", err)
	}
	resp.Body.Close()

	if gotUser != "alice" {
		t.Fatalf("expected basic auth user alice, got %q", gotUser)
	}
	if req.Header.Get("Authorization") != "" {
		t.Fatal("expected original request to be left unmodified")
	}
}

func TestDeviceChangesAreReported(t *testing.T) {
	var changes []string
	s := NewServer(&config.Config{}, func(*types.CCUEvent) {})
	s.SetDeviceChangeHandler(func(iface, address string) { changes = append(changes, iface+" "+address) })

	update := `<?xml version="1.0"?><methodCall><methodName>updateDevice</methodName><params>
<param><value>websocket-server-HmIP-RF</value></param>
<param><value>000A</value></param>
<param><value><i4>0</i4></value></param>
</params></methodCall>`
	s.handleXMLRPC(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/", strings.NewReader(update)))

	multicall := `<?xml version="1.0"?><methodCall><methodName>system.multicall</methodName><params><param><value><array><data>
<value><struct>
<member><name>methodName</name><value>deleteDevices</value></member>
<member><name>params</name><value><array><data>
  <value>websocket-server-BidCos-RF</value>
  <value><array><data><value>LEQ1</value><value>LEQ1:1</value></data></array></value>
</data></array></value></member>
</struct></value>
</data></array></value></param></params></methodCall>`
	s.handleXMLRPC(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/", strings.NewReader(multicall)))

	want := []string{"HmIP-RF 000A", "BidCos-RF LEQ1", "BidCos-RF LEQ1:1"}
	if strings.Join(changes, ",") != strings.Join(want, ",") {
		t.Fatalf("expected %v, got %v", want, changes)
	}
}
