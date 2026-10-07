package websocket

import (
	"encoding/json"
	"testing"
	"time"

	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/home"
)

// A home model without a ReGa: what it does not answer panics
type stubHome struct {
	home.Source
	renamed map[string]string
}

func (h *stubHome) GetRooms() ([]home.NamedObject, error) {
	return []home.NamedObject{{ID: 7, Name: "Küche"}}, nil
}

func (h *stubHome) SetName(address, name string) (string, string, error) {
	previous := h.renamed[address]
	h.renamed[address] = name
	return home.SetOK, previous, nil
}

// The handlers read and change the home model through home.Source, so
// openccu-lite can provide it instead of the ReGa
func TestHandlersUseTheHomeSource(t *testing.T) {
	s := NewServer(nil, nil)
	stub := &stubHome{renamed: map[string]string{"LEQ1:1": "Alt"}}
	s.SetHome(stub)
	call := func(client *Client, m map[string]interface{}) map[string]interface{} {
		data, _ := json.Marshal(m)
		s.handleMessage(client, data)
		var answer map[string]interface{}
		_ = json.Unmarshal(<-client.send, &answer)
		return answer
	}
	user := &Client{send: make(chan []byte, 1), level: auth.LevelUser}
	m := call(user, map[string]interface{}{"type": "getRooms", "requestId": "1", "deviceId": "tablet"})
	rooms, _ := m["rooms"].([]interface{})
	if len(rooms) != 1 || rooms[0].(map[string]interface{})["name"] != "Küche" {
		t.Fatalf("getRooms: %v", m)
	}

	admin := &Client{send: make(chan []byte, 1), level: auth.LevelAdmin, user: "Admin", elevatedUntil: time.Now().Add(time.Hour)}
	if m := call(admin, map[string]interface{}{"type": "rename", "requestId": "2", "address": "LEQ1:1", "name": "Neu"}); m["success"] != true {
		t.Fatalf("rename: %v", m)
	}
	if stub.renamed["LEQ1:1"] != "Neu" {
		t.Fatalf("not renamed: %v", stub.renamed)
	}
}
