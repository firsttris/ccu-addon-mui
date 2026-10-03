package websocket

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/types"
)

func TestHandleMessageInvalidJSONSendsError(t *testing.T) {
	s := NewServer(nil, nil)
	client := &Client{send: make(chan []byte, 1)}

	s.handleMessage(client, []byte("{"))

	select {
	case msg := <-client.send:
		assertErrorMessageContains(t, msg, "invalid JSON")
	default:
		t.Fatal("expected error message to be sent")
	}
}

func TestHandleMessageMissingTypeSendsError(t *testing.T) {
	s := NewServer(nil, nil)
	client := &Client{send: make(chan []byte, 1)}

	s.handleMessage(client, []byte(`{"foo":"bar"}`))

	select {
	case msg := <-client.send:
		assertErrorMessageContains(t, msg, "missing or invalid 'type' field")
	default:
		t.Fatal("expected error message to be sent")
	}
}

func TestHandleMessageSubscribeSetsDeviceAndReturnsResponse(t *testing.T) {
	s := NewServer(nil, nil)
	client := &Client{send: make(chan []byte, 1)}

	s.handleMessage(client, []byte(`{"type":"subscribe","deviceId":"dev-1","channels":["A:1","A:2"],"requestId":"req-1"}`))

	if client.DeviceID() != "dev-1" {
		t.Fatalf("expected deviceID dev-1, got %q", client.DeviceID())
	}

	select {
	case msg := <-client.send:
		var resp types.SubscribeResponse
		if err := json.Unmarshal(msg, &resp); err != nil {
			t.Fatalf("failed to unmarshal subscribe response: %v", err)
		}
		if !resp.Success || resp.Type != "subscribe_response" || resp.DeviceID != "dev-1" || resp.RequestID != "req-1" {
			t.Fatalf("unexpected subscribe response: %+v", resp)
		}
		if len(resp.Channels) != 2 {
			t.Fatalf("expected 2 channels in response, got %d", len(resp.Channels))
		}
	default:
		t.Fatal("expected subscribe response to be sent")
	}
}

func TestBroadcastToClientsFiltersBySubscription(t *testing.T) {
	s := NewServer(nil, nil)

	matching := &Client{id: "1", send: make(chan []byte, 1), deviceID: "dev-1"}
	nonMatching := &Client{id: "2", send: make(chan []byte, 1), deviceID: "dev-2"}
	noDevice := &Client{id: "3", send: make(chan []byte, 1)}

	s.clients[matching] = true
	s.clients[nonMatching] = true
	s.clients[noDevice] = true

	s.subscriptionMgr.Subscribe(matching.id, []string{"A:1"})
	s.subscriptionMgr.Subscribe(nonMatching.id, []string{"B:1"})

	event := &types.CCUEvent{Event: types.Event{Channel: "A:1", Datapoint: "STATE", Value: true}}
	s.BroadcastToClients(event)

	select {
	case <-matching.send:
		// expected
	default:
		t.Fatal("expected matching client to receive broadcast")
	}

	select {
	case <-nonMatching.send:
		t.Fatal("did not expect non-matching client to receive broadcast")
	default:
		// expected
	}

	select {
	case <-noDevice.send:
		t.Fatal("did not expect client without deviceID to receive broadcast")
	default:
		// expected
	}
}

func TestSubscriptionsAreIsolatedPerConnectionWithSameDeviceID(t *testing.T) {
	s := NewServer(nil, nil)

	// Two browser tabs share the deviceId from localStorage.
	tabA := newClient(nil)
	tabB := newClient(nil)
	s.clients[tabA] = true
	s.clients[tabB] = true

	s.handleMessage(tabA, []byte(`{"type":"subscribe","deviceId":"dev-1","channels":["A:1"]}`))
	s.handleMessage(tabB, []byte(`{"type":"subscribe","deviceId":"dev-1","channels":["B:1"]}`))
	<-tabA.send
	<-tabB.send

	// Tab B's subscription must not overwrite tab A's.
	s.BroadcastToClients(&types.CCUEvent{Event: types.Event{Channel: "A:1"}})
	select {
	case <-tabA.send:
	default:
		t.Fatal("expected tab A to still receive events for A:1")
	}

	// Closing tab B must not unsubscribe tab A.
	s.removeClient(tabB)
	s.BroadcastToClients(&types.CCUEvent{Event: types.Event{Channel: "A:1"}})
	select {
	case <-tabA.send:
	default:
		t.Fatal("expected tab A to receive events after tab B disconnected")
	}
}

func TestCheckOrigin(t *testing.T) {
	tests := []struct {
		name    string
		host    string
		headers map[string]string
		want    bool
	}{
		{name: "no origin", host: "127.0.0.1:8088", want: true},
		{name: "same host", host: "ccu3:8088", headers: map[string]string{"Origin": "http://ccu3:8088"}, want: true},
		{name: "dev proxy on other port", host: "localhost:8088", headers: map[string]string{"Origin": "http://localhost:4200"}, want: true},
		{name: "lighttpd X-Forwarded-Host", host: "127.0.0.1", headers: map[string]string{"Origin": "https://ccu3-abc", "X-Forwarded-Host": "ccu3-abc"}, want: true},
		{name: "lighttpd X-Host", host: "127.0.0.1", headers: map[string]string{"Origin": "https://192.168.1.10", "X-Host": "192.168.1.10"}, want: true},
		{name: "case insensitive", host: "CCU3:8088", headers: map[string]string{"Origin": "http://ccu3"}, want: true},
		{name: "foreign site", host: "127.0.0.1", headers: map[string]string{"Origin": "https://evil.example", "X-Forwarded-Host": "ccu3-abc"}, want: false},
		{name: "invalid origin", host: "ccu3", headers: map[string]string{"Origin": "null"}, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/ws/mui", nil)
			r.Host = tt.host
			for k, v := range tt.headers {
				r.Header.Set(k, v)
			}
			if got := checkOrigin(r); got != tt.want {
				t.Fatalf("checkOrigin() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGetRoomsRejectsScriptInjectionInDeviceID(t *testing.T) {
	s := NewServer(nil, rega.NewClient(&config.Config{CCUHost: "127.0.0.1", RegaPort: 1}))
	client := &Client{send: make(chan []byte, 1)}

	s.handleMessage(client, []byte(`{"type":"getRooms","deviceId":"x\"; system.Exec(\"reboot\"); string y = \""}`))

	assertErrorMessageContains(t, <-client.send, "invalid deviceId")
}

func TestGetChannelsReturnsValidJSONAndEchoesRoomID(t *testing.T) {
	regaServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "C\t1\tA:1\tSWITCH_VIRTUAL_RECEIVER\tHmIP-RF\tKinderzimmer \"Paul\"\r\nD\tSTATE\t2\tfalse\r\n")
	}))
	defer regaServer.Close()

	host, port, _ := net.SplitHostPort(regaServer.Listener.Addr().String())
	portNum, _ := strconv.Atoi(port)
	s := NewServer(nil, rega.NewClient(&config.Config{CCUHost: host, RegaPort: portNum}))
	client := &Client{send: make(chan []byte, 1)}

	s.handleMessage(client, []byte(`{"type":"getChannels","deviceId":"dev-1","roomId":"1234"}`))

	var resp struct {
		DeviceID string         `json:"deviceId"`
		RoomID   string         `json:"roomId"`
		Channels []rega.Channel `json:"channels"`
	}
	if err := json.Unmarshal(<-client.send, &resp); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	if resp.DeviceID != "dev-1" || resp.RoomID != "1234" {
		t.Fatalf("expected deviceId and roomId to be echoed, got %+v", resp)
	}
	if len(resp.Channels) != 1 || resp.Channels[0].Name != `Kinderzimmer "Paul"` {
		t.Fatalf("unexpected channels: %+v", resp.Channels)
	}
}

func TestGetChannelsAllRequestsAllDevices(t *testing.T) {
	var gotScript string
	regaServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		gotScript = string(body)
		_, _ = io.WriteString(w, "C\t1\tA:1\tROTARY_HANDLE_TRANSCEIVER\tHmIP-RF\tFenster\r\nD\tSTATE\t16\t2\r\n")
	}))
	defer regaServer.Close()

	host, port, _ := net.SplitHostPort(regaServer.Listener.Addr().String())
	portNum, _ := strconv.Atoi(port)
	s := NewServer(nil, rega.NewClient(&config.Config{CCUHost: host, RegaPort: portNum}))
	client := &Client{send: make(chan []byte, 1)}

	s.handleMessage(client, []byte(`{"type":"getChannels","deviceId":"dev-1","all":true}`))

	var resp struct {
		All      bool           `json:"all"`
		RoomID   string         `json:"roomId"`
		Channels []rega.Channel `json:"channels"`
	}
	if err := json.Unmarshal(<-client.send, &resp); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	if !strings.Contains(gotScript, `"ALL"`) {
		t.Fatalf("expected the script to read all channels, got %s", gotScript)
	}
	if !resp.All || resp.RoomID != "" || len(resp.Channels) != 1 || resp.Channels[0].Datapoints["STATE"] != 2.0 {
		t.Fatalf("unexpected response: %+v", resp)
	}
}

func TestRequestIDIsEchoedInResponsesAndErrors(t *testing.T) {
	regaServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "1\tKüche\r\n")
	}))
	defer regaServer.Close()

	host, port, _ := net.SplitHostPort(regaServer.Listener.Addr().String())
	portNum, _ := strconv.Atoi(port)
	s := NewServer(nil, rega.NewClient(&config.Config{CCUHost: host, RegaPort: portNum}))
	client := &Client{send: make(chan []byte, 3)}

	var resp struct {
		RequestID string `json:"requestId"`
		Type      string `json:"type"`
		Rooms     []rega.NamedObject
	}
	s.handleMessage(client, []byte(`{"type":"getRooms","deviceId":"dev-1","requestId":"q1"}`))
	if err := json.Unmarshal(<-client.send, &resp); err != nil || resp.RequestID != "q1" || len(resp.Rooms) != 1 {
		t.Fatalf("unexpected response: %+v, %v", resp, err)
	}

	s.handleMessage(client, []byte(`{"type":"getRooms","requestId":"q2"}`))
	resp.RequestID = ""
	if err := json.Unmarshal(<-client.send, &resp); err != nil || resp.RequestID != "q2" || resp.Type != "error" {
		t.Fatalf("expected an error for q2, got %+v, %v", resp, err)
	}

	s.handleMessage(client, []byte(`{"type":"nope","requestId":"q3"}`))
	if err := json.Unmarshal(<-client.send, &resp); err != nil || resp.RequestID != "q3" || resp.Type != "error" {
		t.Fatalf("expected an error for q3, got %+v, %v", resp, err)
	}
}

func TestFormatValue(t *testing.T) {
	tests := []struct {
		input   interface{}
		want    string
		wantErr bool
	}{
		{input: true, want: "true"},
		{input: float64(21.5), want: "21.5"},
		{input: float64(1000000), want: "1000000"},
		{input: "on", want: "on"},
		{input: nil, wantErr: true},
		{input: map[string]interface{}{}, wantErr: true},
	}

	for _, tt := range tests {
		got, err := formatValue(tt.input)
		if tt.wantErr {
			if err == nil {
				t.Fatalf("formatValue(%#v) = %q, want error", tt.input, got)
			}
			continue
		}
		if err != nil || got != tt.want {
			t.Fatalf("formatValue(%#v) = %q, %v, want %q", tt.input, got, err, tt.want)
		}
	}
}

func TestSetDatapointRejectsNullValue(t *testing.T) {
	s := NewServer(nil, nil)
	client := &Client{send: make(chan []byte, 1)}

	s.handleMessage(client, []byte(`{"type":"setDatapoint","requestId":"r1","interfaceName":"HmIP-RF","address":"000A:4","attribute":"LEVEL","value":null}`))

	var resp setDatapointResponse
	if err := json.Unmarshal(<-client.send, &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Type != "setDatapoint_response" || resp.Success || resp.RequestID != "r1" || !contains(resp.Error, "value must be") {
		t.Fatalf("unexpected response: %+v", resp)
	}
}

// fakeCCUWebUI accepts the login Admin/secret.
func fakeCCUWebUI() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Method string            `json:"method"`
			Params map[string]string `json:"params"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		if req.Method == "Session.login" && req.Params["username"] == "Admin" && req.Params["password"] == "secret" {
			_, _ = io.WriteString(w, `{"result":"session","error":null}`)
			return
		}
		if req.Method == "Session.logout" {
			_, _ = io.WriteString(w, `{"result":true,"error":null}`)
			return
		}
		_, _ = io.WriteString(w, `{"result":null,"error":{"code":501,"message":"invalid credentials"}}`)
	}))
}

func readAuthResponse(t *testing.T, client *Client) authResponse {
	t.Helper()
	var resp authResponse
	if err := json.Unmarshal(<-client.send, &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Type != "auth_response" {
		t.Fatalf("expected auth_response, got %+v", resp)
	}
	return resp
}

func TestAuthRequiredBeforeAnyRequest(t *testing.T) {
	webUI := fakeCCUWebUI()
	defer webUI.Close()
	a, err := auth.New(webUI.URL, filepath.Join(t.TempDir(), "key"))
	if err != nil {
		t.Fatal(err)
	}
	a.SetLevelFunc(func(string) (string, error) { return auth.LevelUser, nil })
	s := NewServer(nil, nil)
	s.SetAuthenticator(a)
	client := &Client{send: make(chan []byte, 4)}

	// Nothing works before logging in
	s.handleMessage(client, []byte(`{"type":"subscribe","deviceId":"dev-1","channels":["A:1"]}`))
	assertErrorMessageContains(t, <-client.send, "authentication required")
	if len(s.subscriptionMgr.GetSubscriptions(client.id)) != 0 {
		t.Fatal("an unauthenticated client must not be able to subscribe")
	}

	// A connection without token is asked to log in
	s.handleMessage(client, []byte(`{"type":"auth"}`))
	if resp := readAuthResponse(t, client); resp.Success || !resp.AuthRequired || resp.Code != "LOGIN_REQUIRED" {
		t.Fatalf("unexpected response: %+v", resp)
	}

	s.handleMessage(client, []byte(`{"type":"login","username":"Admin","password":"wrong"}`))
	if resp := readAuthResponse(t, client); resp.Success || resp.Code != "INVALID_CREDENTIALS" {
		t.Fatalf("unexpected response: %+v", resp)
	}

	s.handleMessage(client, []byte(`{"type":"login","username":"Admin","password":"secret"}`))
	login := readAuthResponse(t, client)
	if !login.Success || login.Token == "" || login.User != "Admin" || login.Level != auth.LevelUser {
		t.Fatalf("unexpected response: %+v", login)
	}

	s.handleMessage(client, []byte(`{"type":"subscribe","deviceId":"dev-1","channels":["A:1"]}`))
	if len(s.subscriptionMgr.GetSubscriptions(client.id)) != 1 {
		t.Fatal("expected subscribe to work after login")
	}
	<-client.send

	// A new connection (e.g. after the app was closed) logs in with the stored token
	other := &Client{send: make(chan []byte, 1)}
	s.handleMessage(other, []byte(`{"type":"auth","token":"`+login.Token+`"}`))
	if resp := readAuthResponse(t, other); !resp.Success || resp.Token == "" || resp.Level != auth.LevelUser {
		t.Fatalf("expected the stored token to be accepted and renewed: %+v", resp)
	}
	if !other.authenticated {
		t.Fatal("expected the client to be authenticated")
	}
}

func TestAuthDisabledAcceptsEveryone(t *testing.T) {
	s := NewServer(nil, nil)
	client := &Client{send: make(chan []byte, 1)}

	s.handleMessage(client, []byte(`{"type":"auth"}`))
	if resp := readAuthResponse(t, client); !resp.Success || resp.AuthRequired || resp.Level != auth.LevelAdmin {
		t.Fatalf("unexpected response: %+v", resp)
	}
}

func TestSendDoesNotBlockOnFullBuffer(t *testing.T) {
	s := NewServer(nil, nil)
	client := &Client{send: make(chan []byte, 1)}

	done := make(chan struct{})
	go func() {
		s.sendError(client, "first")
		s.sendError(client, "second") // buffer full, must be dropped
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("send blocked on a full client buffer")
	}
}

func TestRemoveClientUnsubscribesOnlyThatConnection(t *testing.T) {
	s := NewServer(nil, nil)
	tabA := newClient(nil)
	tabB := newClient(nil)
	s.clients[tabA] = true
	s.clients[tabB] = true
	s.subscriptionMgr.Subscribe(tabA.id, []string{"A:1"})
	s.subscriptionMgr.Subscribe(tabB.id, []string{"A:1"})

	s.removeClient(tabB)

	if _, ok := <-tabB.send; ok {
		t.Fatal("expected send channel of removed client to be closed")
	}
	if got := s.subscriptionMgr.GetSubscriptions(tabA.id); len(got) != 1 {
		t.Fatalf("expected tab A to keep its subscription, got %v", got)
	}
	// Removing twice must not panic on the closed channel.
	s.removeClient(tabB)
}

func assertErrorMessageContains(t *testing.T, msg []byte, want string) {
	t.Helper()

	var resp types.ErrorResponse
	if err := json.Unmarshal(msg, &resp); err != nil {
		t.Fatalf("failed to unmarshal error response: %v", err)
	}
	if resp.Type != "error" {
		t.Fatalf("expected response type error, got %q", resp.Type)
	}
	if resp.Error == "" || !contains(resp.Error, want) {
		t.Fatalf("expected error message to contain %q, got %q", want, resp.Error)
	}
}

func contains(s, want string) bool {
	return len(want) == 0 || (len(s) >= len(want) && (indexOf(s, want) >= 0))
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

type fakeDeviceRPC struct {
	calls []string
}

func (f *fakeDeviceRPC) GetParamsetDescription(iface, address, key string) (ccurpc.ParamsetDescription, error) {
	f.calls = append(f.calls, "description "+iface+" "+address+" "+key)
	if address == "bad" {
		return nil, ccurpc.ErrInvalidAddress
	}
	return ccurpc.ParamsetDescription{"STATE": {Type: "BOOL", Operations: 7}}, nil
}

func (f *fakeDeviceRPC) GetParamset(iface, address, key string) (map[string]interface{}, error) {
	f.calls = append(f.calls, "values "+iface+" "+address+" "+key)
	return map[string]interface{}{"STATE": true}, nil
}

func (f *fakeDeviceRPC) ListDevices(iface string) ([]ccurpc.DeviceDescription, error) {
	return nil, nil
}

func (f *fakeDeviceRPC) InterfaceNames() []string { return []string{"HmIP-RF"} }

func (f *fakeDeviceRPC) SetInstallMode(iface string, on bool, seconds int) error { return nil }

func (f *fakeDeviceRPC) GetInstallMode(iface string) (int, error) { return 0, nil }

func (f *fakeDeviceRPC) DeleteDevice(iface, address string, flags int) error { return nil }

func (f *fakeDeviceRPC) Forget(iface, deviceAddress string) {}

func (f *fakeDeviceRPC) PutParamset(iface, address, key string, values map[string]interface{}) error {
	f.calls = append(f.calls, fmt.Sprintf("put %s %s %s %v", iface, address, key, values))
	return nil
}

func TestParamsetRequests(t *testing.T) {
	s := NewServer(nil, nil)
	client := &Client{send: make(chan []byte, 3)}

	// Without XML-RPC client
	s.handleMessage(client, []byte(`{"type":"getParamset","requestId":"q0","interfaceName":"HmIP-RF","address":"A:1","paramsetKey":"VALUES"}`))
	assertErrorMessageContains(t, <-client.send, "not available")

	rpc := &fakeDeviceRPC{}
	s.SetDeviceRPC(rpc)

	s.handleMessage(client, []byte(`{"type":"getParamsetDescription","requestId":"q1","interfaceName":"HmIP-RF","address":"A:1","paramsetKey":"VALUES"}`))
	var description struct {
		Type        string
		RequestID   string `json:"requestId"`
		Description map[string]struct {
			Type       string `json:"type"`
			Operations int    `json:"operations"`
		} `json:"description"`
	}
	if err := json.Unmarshal(<-client.send, &description); err != nil || description.Type != "paramsetDescription" ||
		description.RequestID != "q1" || description.Description["STATE"].Operations != 7 {
		t.Fatalf("unexpected response: %+v, %v", description, err)
	}

	s.handleMessage(client, []byte(`{"type":"getParamset","requestId":"q2","interfaceName":"HmIP-RF","address":"A:1","paramsetKey":"VALUES"}`))
	var values struct {
		Type      string
		RequestID string                 `json:"requestId"`
		Values    map[string]interface{} `json:"values"`
	}
	if err := json.Unmarshal(<-client.send, &values); err != nil || values.Type != "paramset" || values.Values["STATE"] != true {
		t.Fatalf("unexpected response: %+v, %v", values, err)
	}

	s.handleMessage(client, []byte(`{"type":"getParamsetDescription","requestId":"q3","interfaceName":"HmIP-RF","address":"bad","paramsetKey":"VALUES"}`))
	assertErrorMessageContains(t, <-client.send, "invalid address")

	if len(rpc.calls) != 3 || rpc.calls[0] != "description HmIP-RF A:1 VALUES" {
		t.Fatalf("unexpected calls: %v", rpc.calls)
	}
}

func TestPutParamsetOnlyForAdministrators(t *testing.T) {
	s := NewServer(nil, nil)
	rpc := &fakeDeviceRPC{}
	s.SetDeviceRPC(rpc)
	client := &Client{send: make(chan []byte, 6)}
	put := `{"type":"putParamset","requestId":"q1","interfaceName":"HmIP-RF","address":"A:1","paramsetKey":"MASTER","values":{"STATE":false}}`

	client.setSession("Gast", auth.LevelGuest)
	s.handleMessage(client, []byte(put))
	assertErrorMessageContains(t, <-client.send, "only administrators")

	client.setSession("Benutzer", auth.LevelUser)
	s.handleMessage(client, []byte(put))
	assertErrorMessageContains(t, <-client.send, "only administrators")

	client.setSession("Admin", auth.LevelAdmin)
	s.handleMessage(client, []byte(put))
	assertErrorMessageContains(t, <-client.send, "password again")

	client.elevatedUntil = time.Now().Add(-time.Second) // expired
	s.handleMessage(client, []byte(put))
	assertErrorMessageContains(t, <-client.send, "password again")

	client.elevatedUntil = time.Now().Add(time.Hour)
	s.handleMessage(client, []byte(`{"type":"putParamset","requestId":"q2","interfaceName":"HmIP-RF","address":"A:1","paramsetKey":"VALUES","values":{"STATE":false}}`))
	assertErrorMessageContains(t, <-client.send, "only the MASTER paramset")

	if len(rpc.calls) != 0 {
		t.Fatalf("nothing must reach the CCU: %v", rpc.calls)
	}
}
