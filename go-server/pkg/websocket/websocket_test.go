package websocket

import (
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

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

	s.handleMessage(client, []byte(`{"type":"setDatapoint","interfaceName":"HmIP-RF","address":"000A:4","attribute":"LEVEL","value":null}`))

	assertErrorMessageContains(t, <-client.send, "value must be")
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
