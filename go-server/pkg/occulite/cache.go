package occulite

import (
	"sync"

	"ccu-addon-mui-server/pkg/ccurpc"
)

// What the home model keeps between requests, so that a room's channels do
// not cost the whole metadata snapshot and a listDevices of every interface
// each time. Both are kept only while a stream says when they change:
//
//   - the snapshot while the metadata change stream is connected
//     (FollowMeta); every event drops it, and so does every change the
//     add-on makes itself, before its answer goes out
//   - the device lists while lite-rpc's event stream is followed
//     (main_lite.go follow); newDevices, deleteDevices, updateDevice,
//     replaceDevice, readdedDevice and interface drop an interface's list, a
//     resync all of them
//
// A read that started before a change is not kept (gen).

type metaCache struct {
	mu sync.Mutex
	// The change stream is connected
	live bool
	// Counts the changes; a snapshot read across one is not kept
	gen      uint64
	snapshot *Snapshot
	// The snapshot read last, also after a change: what a deleted node had
	// below it (onMetaEvent)
	last *Snapshot
}

type deviceCache struct {
	mu   sync.Mutex
	live bool
	// Counts the changes of any interface
	gen   uint64
	lists map[string][]ccurpc.DeviceDescription
}

func (h *Home) snapshot() (Snapshot, error) {
	c := &h.meta
	c.mu.Lock()
	if c.live && c.snapshot != nil {
		snapshot := *c.snapshot
		c.mu.Unlock()
		return snapshot, nil
	}
	gen := c.gen
	c.mu.Unlock()

	ctx, cancel := h.context()
	defer cancel()
	snapshot, err := h.client.Snapshot(ctx)
	if err != nil {
		return snapshot, err
	}
	c.mu.Lock()
	c.last = &snapshot
	if c.live && c.gen == gen {
		c.snapshot = &snapshot
	}
	c.mu.Unlock()
	return snapshot, nil
}

// metaChanged drops the kept snapshot: an event of the change stream, or a
// change the add-on made
func (h *Home) metaChanged() {
	c := &h.meta
	c.mu.Lock()
	c.gen++
	c.snapshot = nil
	c.mu.Unlock()
}

// metaLive: the change stream connected (true) or ended (false)
func (h *Home) metaLive(live bool) {
	c := &h.meta
	c.mu.Lock()
	c.live = live
	c.gen++
	c.snapshot = nil
	c.mu.Unlock()
}

// lastSnapshot is the snapshot read last, if any
func (h *Home) lastSnapshot() (Snapshot, bool) {
	c := &h.meta
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.last == nil {
		return Snapshot{}, false
	}
	return *c.last, true
}

// listDevices is the interface's device list, kept while the event stream
// is followed
func (h *Home) listDevices(iface string) ([]ccurpc.DeviceDescription, error) {
	c := &h.deviceLists
	c.mu.Lock()
	if list, ok := c.lists[iface]; ok && c.live {
		c.mu.Unlock()
		return list, nil
	}
	gen := c.gen
	c.mu.Unlock()

	list, err := h.rpc.ListDevices(iface)
	if err != nil {
		return nil, err
	}
	c.mu.Lock()
	if c.live && c.gen == gen {
		if c.lists == nil {
			c.lists = map[string][]ccurpc.DeviceDescription{}
		}
		c.lists[iface] = list
	}
	c.mu.Unlock()
	return list, nil
}

// DevicesChanged drops the interface's device list ("" all of them): the
// event stream said it changed, or events were lost
func (h *Home) DevicesChanged(iface string) {
	c := &h.deviceLists
	c.mu.Lock()
	defer c.mu.Unlock()
	c.gen++
	if iface == "" {
		c.lists = nil
		return
	}
	delete(c.lists, iface)
}

// FollowingEvents: lite-rpc's event stream is followed (true) or not any
// more (false); the device lists are kept only meanwhile
func (h *Home) FollowingEvents(live bool) {
	c := &h.deviceLists
	c.mu.Lock()
	c.live = live
	c.mu.Unlock()
	h.DevicesChanged("")
}
