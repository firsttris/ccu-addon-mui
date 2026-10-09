package occulite

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"ccu-addon-mui-server/pkg/tiles"
)

func openTiles(t *testing.T, dir string) *tiles.Store {
	t.Helper()
	store, err := tiles.Open(filepath.Join(dir, "mui-tiles.json"))
	if err != nil {
		t.Fatal(err)
	}
	return store
}

// layoutOf is a layout that names its view, "" for none
func layoutOf(name string) string {
	if name == "" {
		return ""
	}
	return `{"name":"` + name + `"}`
}

func setLayout(t *testing.T, store *tiles.Store, id int64, name string) {
	t.Helper()
	if err := store.SetLayout(id, layoutOf(name), func(int64) bool { return true }); err != nil {
		t.Fatal(err)
	}
}

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

	dir := t.TempDir()
	h, err := NewHome(New(server.URL, ""), nil, dir)
	if err != nil {
		t.Fatal(err)
	}
	h.SetTiles(openTiles(t, dir))
	for path, name := range map[string]string{"room/og/bad": "bad", "room/og/bad/dusche": "dusche", "room/keller": "keller", "room/og": "og"} {
		setLayout(t, h.tiles, ID(path), name)
	}

	since, err := h.client.MetaEvents(context.Background(), 0, h.onMetaEvent)
	if since != 9 {
		t.Fatalf("since %d (%v)", since, err)
	}
	want := map[int64]string{ID("room/eg/bad"): "bad", ID("room/eg/bad/dusche"): "dusche", ID("room/og"): "og"}
	// Written to mui-tiles.json: read back as after a restart
	got := openTiles(t, dir)
	for _, path := range []string{"room/og/bad", "room/og/bad/dusche", "room/keller", "room/eg/bad", "room/eg/bad/dusche", "room/og"} {
		if layout, name := got.Layout(ID(path)), want[ID(path)]; layout != layoutOf(name) {
			t.Fatalf("layout of %s: %q, want %q", path, layout, layoutOf(name))
		}
	}
	if h.store.data.MetaRevision != 9 {
		t.Fatalf("kept revision %d", h.store.data.MetaRevision)
	}
}

// After a restart FollowMeta asks from the revision it kept; a resync (the
// server no longer has those events) moves the revision on and keeps the
// layouts, which may belong to favorite lists
func TestFollowMetaStartsFromTheKeptRevision(t *testing.T) {
	asked := make(chan string, 4)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		asked <- r.URL.Query().Get("since")
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: {\"revision\":2000,\"kind\":\"resync\"}\n\n")
	}))
	defer server.Close()
	dir := t.TempDir()
	h, _ := NewHome(New(server.URL, ""), nil, dir)
	h.SetTiles(openTiles(t, dir))
	setLayout(t, h.tiles, 900001, "favorites")
	h.keepRevision(12)

	h, _ = NewHome(New(server.URL, ""), nil, dir)
	h.SetTiles(openTiles(t, dir))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go h.FollowMeta(ctx)
	if first := <-asked; first != "12" {
		t.Fatalf("first since %q", first)
	}
	if again := <-asked; again != "2000" {
		t.Fatalf("after the resync since %q", again)
	}
	var revision int64
	var layout string
	h.store.read(func(data *ownData) { revision = data.MetaRevision })
	layout = h.tiles.Layout(900001)
	if revision != 2000 || layout != layoutOf("favorites") {
		t.Fatalf("revision %d, layout %q", revision, layout)
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
