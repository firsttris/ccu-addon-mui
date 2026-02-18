package websocket

import (
	"encoding/json"
	"testing"

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

	if client.deviceID != "dev-1" {
		t.Fatalf("expected deviceID dev-1, got %q", client.deviceID)
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

	matching := &Client{send: make(chan []byte, 1), deviceID: "dev-1"}
	nonMatching := &Client{send: make(chan []byte, 1), deviceID: "dev-2"}
	noDevice := &Client{send: make(chan []byte, 1)}

	s.clients[matching] = true
	s.clients[nonMatching] = true
	s.clients[noDevice] = true

	s.subscriptionMgr.Subscribe("dev-1", []string{"A:1"})
	s.subscriptionMgr.Subscribe("dev-2", []string{"B:1"})

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
