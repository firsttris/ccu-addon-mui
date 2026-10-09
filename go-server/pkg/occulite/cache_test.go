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
	values     map[string]map[string]interface{}
	listCalls  atomic.Int32
	paramCalls atomic.Int32
}

func (f *fakeRPC) InterfaceNames() []string { return []string{"HmIP-RF"} }
func (f *fakeRPC) ListDevices(iface string) ([]ccurpc.DeviceDescription, error) {
	f.listCalls.Add(1)
	return f.devices[iface], nil
}
func (f *fakeRPC) GetParamsetDescription(string, string, string) (ccurpc.ParamsetDescription, error) {
	return ccurpc.ParamsetDescription{}, nil
}
func (f *fakeRPC) GetParamset(iface, address, key string) (map[string]interface{}, error) {
	f.paramCalls.Add(1)
	return f.values[address], nil
}
func (f *fakeRPC) CallRaw(string, string, ...interface{}) (interface{}, error) { return nil, nil }

// The snapshot is read once while the change stream is connected, again
// after every change, and every time without the stream
func TestSnapshotKeptWhileTheStreamIsConnected(t *testing.T) {
	var reads atomic.Int32
	var h *Home
	changeWhileReading := atomic.Bool{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reads.Add(1)
		if changeWhileReading.Load() {
			// An event arrives while the snapshot is on its way
			h.metaChanged()
		}
		_ = json.NewEncoder(w).Encode(Snapshot{Revision: int64(reads.Load())})
	}))
	defer server.Close()
	h, _ = NewHome(New(server.URL, ""), nil, "")
	read := func() {
		t.Helper()
		if _, err := h.snapshot(); err != nil {
			t.Fatal(err)
		}
	}

	read()
	read()
	if n := reads.Load(); n != 2 {
		t.Fatalf("without the stream: %d reads, want 2", n)
	}
	h.metaLive(true)
	read()
	read()
	read()
	if n := reads.Load(); n != 3 {
		t.Fatalf("with the stream: %d reads, want 3", n)
	}
	h.onMetaEvent(MetaEvent{Revision: 5, Kind: "object.updated"})
	read()
	read()
	if n := reads.Load(); n != 4 {
		t.Fatalf("after an event: %d reads, want 4", n)
	}
	// A read across a change is not kept
	h.metaChanged()
	changeWhileReading.Store(true)
	read()
	changeWhileReading.Store(false)
	read()
	if n := reads.Load(); n != 6 {
		t.Fatalf("after a read across a change: %d reads, want 6", n)
	}
	h.metaLive(false)
	read()
	if n := reads.Load(); n != 7 {
		t.Fatalf("after the stream ended: %d reads, want 7", n)
	}
}

// The device lists are kept while the event stream is followed; a device
// event drops the interface's list, a resync all of them
func TestDeviceListsKeptWhileEventsAreFollowed(t *testing.T) {
	rpc := &fakeRPC{devices: map[string][]ccurpc.DeviceDescription{"HmIP-RF": {{Address: "000A", Type: "HmIP-BSM"}}}}
	h, _ := NewHome(New("http://127.0.0.1:1", ""), rpc, "")
	list := func() {
		t.Helper()
		if l, err := h.listDevices("HmIP-RF"); err != nil || len(l) != 1 {
			t.Fatalf("%v %v", l, err)
		}
	}
	list()
	list()
	if n := rpc.listCalls.Load(); n != 2 {
		t.Fatalf("not following: %d calls, want 2", n)
	}
	h.FollowingEvents(true)
	list()
	list()
	list()
	if n := rpc.listCalls.Load(); n != 3 {
		t.Fatalf("following: %d calls, want 3", n)
	}
	h.DevicesChanged("BidCos-RF")
	list()
	if n := rpc.listCalls.Load(); n != 3 {
		t.Fatalf("another interface changed: %d calls, want 3", n)
	}
	h.DevicesChanged("HmIP-RF")
	list()
	list()
	if n := rpc.listCalls.Load(); n != 4 {
		t.Fatalf("after newDevices: %d calls, want 4", n)
	}
	h.DevicesChanged("")
	list()
	if n := rpc.listCalls.Load(); n != 5 {
		t.Fatalf("after a resync: %d calls, want 5", n)
	}
	h.FollowingEvents(false)
	list()
	list()
	if n := rpc.listCalls.Load(); n != 7 {
		t.Fatalf("stopped following: %d calls, want 7", n)
	}
}

// The state store keeps only the datapoints occulited's cards draw: an
// HmIP channel's other values are read once from the process, without
// replacing what the store had
func TestReadValuesFillsWhatTheStateStoreLacks(t *testing.T) {
	rpc := &fakeRPC{values: map[string]map[string]interface{}{
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
			_, err := c.MetaEvents(context.Background(), 0, nil, func(MetaEvent) {})
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
