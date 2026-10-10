package occulite

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"ccu-addon-mui-server/pkg/ccurpc"
)

// fakeRPC answers the home model's calls from fixed lists and counts them
type fakeRPC struct {
	devices    map[string][]ccurpc.DeviceDescription
	values     map[string]map[string]any
	paramCalls atomic.Int32
}

func (f *fakeRPC) InterfaceNames() []string { return []string{"HmIP-RF"} }
func (f *fakeRPC) ListDevices(iface string) ([]ccurpc.DeviceDescription, error) {
	return f.devices[iface], nil
}
func (f *fakeRPC) GetParamsetDescription(string, string, string) (ccurpc.ParamsetDescription, error) {
	return ccurpc.ParamsetDescription{}, nil
}
func (f *fakeRPC) GetParamset(iface, address, key string) (map[string]any, error) {
	f.paramCalls.Add(1)
	return f.values[address], nil
}
func (f *fakeRPC) CallRaw(string, string, ...any) (any, error) { return nil, nil }

// The state store keeps only the datapoints occulited's cards draw: an
// HmIP channel's other values are read once from the process, without
// replacing what the store had
func TestReadValuesFillsWhatTheStateStoreLacks(t *testing.T) {
	rpc := &fakeRPC{values: map[string]map[string]any{
		"000A:3": {"STATE": false, "SECTION": 2, "PROCESS": 0},
	}}
	h, _ := NewHome(New("http://127.0.0.1:1", ""), rpc, "")
	h.Seed([]StateEntry{{Interface: "HmIP-RF", Address: "000A:3", Datapoint: "STATE", Value: true, LC: time.Now().Format(time.RFC3339)}})
	ch := channelInfo{iface: "HmIP-RF", desc: ccurpc.DeviceDescription{Address: "000A:3", Parent: "000A"}}
	h.readValues(ch)
	h.readValues(ch)
	if n := rpc.paramCalls.Load(); n != 1 {
		t.Fatalf("getParamset %d times, want once", n)
	}
	if v, _ := h.value("000A:3", "STATE"); v != true {
		t.Fatalf("STATE %v: the store's value was replaced", v)
	}
	if v, ok := h.value("000A:3", "SECTION"); !ok || v != 2 {
		t.Fatalf("SECTION %v %v: not read", v, ok)
	}
	// BidCos would ask the device: not read
	h.readValues(channelInfo{iface: "BidCos-RF", desc: ccurpc.DeviceDescription{Address: "LEQ1:1", Parent: "LEQ1"}})
	if n := rpc.paramCalls.Load(); n != 1 {
		t.Fatalf("BidCos read: %d calls", n)
	}
}

// occulited deletes a node's subtree with one node.deleted: the layouts of
// the nodes below it go too
func TestDeletedNodeTakesTheLayoutsBelow(t *testing.T) {
	snapshot := Snapshot{Enums: map[string]Enum{"room": {Tree: []Node{
		{ID: "eg", Name: "Erdgeschoss", Children: []Node{
			{ID: "bad", Name: "Bad", Children: []Node{{ID: "dusche", Name: "Dusche"}}},
		}},
		{ID: "egal", Name: "Egal"},
	}}}}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(snapshot)
	}))
	defer server.Close()
	dir := t.TempDir()
	h, _ := NewHome(New(server.URL, ""), nil, dir)
	h.SetTiles(openTiles(t, dir))
	for _, path := range []string{"room/eg", "room/eg/bad", "room/eg/bad/dusche", "room/egal"} {
		setLayout(t, h.tiles, ID(path), path)
	}
	// The app read the rooms before
	if _, err := h.snapshot(); err != nil {
		t.Fatal(err)
	}
	h.onMetaEvent(MetaEvent{Revision: 3, Kind: "node.deleted", Enum: "room", Path: "room/eg"})
	got := openTiles(t, dir)
	for _, path := range []string{"room/eg", "room/eg/bad", "room/eg/bad/dusche"} {
		if layout := got.Layout(ID(path)); layout != "" {
			t.Fatalf("layout of %s left: %q", path, layout)
		}
	}
	// room/egal only shares the prefix of the name
	if layout := got.Layout(ID("room/egal")); layout != layoutOf("room/egal") {
		t.Fatalf("layout of room/egal: %q", layout)
	}
}

// A stream whose request is never answered ends after streamHeaderTimeout,
// so it is opened again instead of hanging without events
func TestStreamWaitsForItsHeadersOnlySoLong(t *testing.T) {
	defer func(previous time.Duration) { streamHeaderTimeout = previous }(streamHeaderTimeout)
	streamHeaderTimeout = 100 * time.Millisecond
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-release:
		case <-r.Context().Done():
		}
	}))
	defer server.Close()
	defer close(release)
	c := New(server.URL, "")
	for name, open := range map[string]func() error{
		"events": func() error { _, err := c.stream(context.Background(), "", func(StreamMessage) {}); return err },
		"meta": func() error {
			_, err := c.MetaEvents(context.Background(), 0, func(MetaEvent) {})
			return err
		},
	} {
		done := make(chan error, 1)
		go func() { done <- open() }()
		select {
		case err := <-done:
			if err == nil {
				t.Fatalf("%s: no error", name)
			}
		case <-time.After(5 * time.Second):
			t.Fatalf("%s: still waiting for the headers", name)
		}
	}
}
