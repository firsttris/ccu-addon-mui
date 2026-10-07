package occulite

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// A moved room keeps its layout, and so do the rooms below it; a deleted
// room's layout goes
func TestLayoutsFollowTheirRooms(t *testing.T) {
	snapshot := Snapshot{Enums: map[string]Enum{"room": {Tree: []Node{
		{ID: "eg", Name: "Erdgeschoss", Children: []Node{
			{ID: "bad", Name: "Bad", Children: []Node{{ID: "dusche", Name: "Dusche"}}},
		}},
		{ID: "og", Name: "Obergeschoss"},
		{ID: "keller", Name: "Keller"},
	}}}}
	events := []MetaEvent{
		{Revision: 7, Kind: "node.moved", Enum: "room", From: "room/og/bad", To: "room/eg/bad"},
		{Revision: 8, Kind: "node.moved", Enum: "room", From: "room/eg", To: "room/eg"},
		{Revision: 9, Kind: "node.deleted", Enum: "room", Path: "room/keller"},
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/meta/v1/snapshot":
			_ = json.NewEncoder(w).Encode(snapshot)
		case "/api/meta/v1/events/sse":
			w.Header().Set("Content-Type", "text/event-stream")
			fmt.Fprint(w, ": connected\n\n")
			for _, e := range events {
				data, _ := json.Marshal(e)
				fmt.Fprintf(w, "data: %s\n\n", data)
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	h, err := NewHome(New(server.URL, ""), nil, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	h.store.data.Layouts[ID("room/og/bad")] = "bad"
	h.store.data.Layouts[ID("room/og/bad/dusche")] = "dusche"
	h.store.data.Layouts[ID("room/keller")] = "keller"
	h.store.data.Layouts[ID("room/og")] = "og"

	since, err := h.client.MetaEvents(context.Background(), 0, h.onMetaEvent)
	if since != 9 {
		t.Fatalf("since %d (%v)", since, err)
	}
	want := map[int64]string{ID("room/eg/bad"): "bad", ID("room/eg/bad/dusche"): "dusche", ID("room/og"): "og"}
	got := h.store.data.Layouts
	if len(got) != len(want) {
		t.Fatalf("layouts %v", got)
	}
	for id, layout := range want {
		if got[id] != layout {
			t.Fatalf("layout %d: %q, want %q (%v)", id, got[id], layout, got)
		}
	}
}

// FollowMeta asks again from the last revision after the stream ended
func TestFollowMetaResumes(t *testing.T) {
	asked := make(chan string, 4)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		asked <- r.URL.Query().Get("since")
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: {\"revision\":41,\"kind\":\"object.updated\"}\n\n")
	}))
	defer server.Close()
	h, _ := NewHome(New(server.URL, ""), nil, "")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go h.FollowMeta(ctx)
	if first := <-asked; first != "" {
		t.Fatalf("first since %q", first)
	}
	select {
	case again := <-asked:
		if again != "41" {
			t.Fatalf("resumed with since %q", again)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("did not reconnect")
	}
}
