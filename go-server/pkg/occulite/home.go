package occulite

import (
	"context"
	"hash/fnv"
	"reflect"
	"sync"
	"time"

	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/home"
	"ccu-addon-mui-server/pkg/tiles"
)

// RPC is the part of ccurpc.Client the home model reads devices and values
// with: the interface processes on the system's local ports
type RPC interface {
	InterfaceNames() []string
	ListDevices(iface string) ([]ccurpc.DeviceDescription, error)
	GetParamsetDescription(iface, address, paramsetKey string) (ccurpc.ParamsetDescription, error)
	GetParamset(iface, address, paramsetKey string) (map[string]any, error)
	CallRaw(iface, method string, args ...any) (any, error)
}

// Home is openccu-lite's home model for the add-on: names, rooms and
// functions from occulited's metadata API, the devices and channels from
// the interface processes, their values from the state store and the event
// stream, and what the CCU kept as ReGa metadata in a file of its own.
type Home struct {
	// Who calls: the add-on itself, or a user (ForSession)
	client *Client
	rpc    RPC
	*homeState
}

// homeState is what all views of the home model share
type homeState struct {
	unsupported
	store *store
	// The tile layouts (pkg/tiles), kept by the server for every platform;
	// here only to move them with their rooms and functions
	tiles *tiles.Store

	mu sync.Mutex
	// The last value of every datapoint by channel address, and since when
	// it has it (Unix seconds)
	values map[string]map[string]any
	since  map[string]map[string]int64
	// Channels whose values were read once (HmIP and virtual channels
	// answer from the process's cache; BidCos would ask the device)
	read map[string]bool
	// The interface of every device and channel address
	interfaces map[string]string

	// The metadata snapshot read last: what a deleted node had below it
	// (onMetaEvent)
	lastMu       sync.Mutex
	lastSnapshot *Snapshot
}

var _ home.Source = (*Home)(nil)

// NewHome returns the home model behind client and rpc; dataDir holds its
// own data (mui-lite.json)
func NewHome(client *Client, rpc RPC, dataDir string) (*Home, error) {
	s, err := openStore(dataDir)
	if err != nil {
		return nil, err
	}
	return &Home{client: client, rpc: rpc, homeState: &homeState{
		store:  s,
		values: map[string]map[string]any{}, since: map[string]map[string]int64{},
		read: map[string]bool{}, interfaces: map[string]string{},
	}}, nil
}

// userRPC is an RPC that can call with a user's session (ccurpc through
// lite-rpc)
type userRPC interface {
	WithToken(token string) *ccurpc.Client
}

// ForSession is the home model acting for a user: occulited's APIs and the
// interface processes are called with the user's session, so the system
// checks the user's level and names the user in its journal. It shares
// the values and the add-on's own data.
func (h *Home) ForSession(session string) home.Source {
	if session == "" {
		return h
	}
	rpc := h.rpc
	if r, ok := h.rpc.(userRPC); ok {
		rpc = r.WithToken(session)
	}
	return &Home{client: h.client.WithBearer(session), rpc: rpc, homeState: h.homeState}
}

const callTimeout = 15 * time.Second

func (h *Home) context() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), callTimeout)
}

func (h *Home) snapshot() (Snapshot, error) {
	ctx, cancel := h.context()
	defer cancel()
	snapshot, err := h.client.Snapshot(ctx)
	if err == nil {
		h.lastMu.Lock()
		h.lastSnapshot = &snapshot
		h.lastMu.Unlock()
	}
	return snapshot, err
}

// lastRead is the snapshot read last, if any
func (h *Home) lastRead() (Snapshot, bool) {
	h.lastMu.Lock()
	defer h.lastMu.Unlock()
	if h.lastSnapshot == nil {
		return Snapshot{}, false
	}
	return *h.lastSnapshot, true
}

// ID is the stable number the app knows a room, function or channel by:
// openccu-lite has paths and refs instead of ReGa's ids. Below 2^52, so
// JavaScript keeps it exact.
func ID(key string) int64 {
	sum := fnv.New64a()
	_, _ = sum.Write([]byte(key))
	id := int64(sum.Sum64() & (1<<52 - 1))
	if id < 1_000_000 {
		id += 1_000_000
	}
	return id
}

// Seed takes the state store's values; the event stream keeps them
func (h *Home) Seed(entries []StateEntry) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, e := range entries {
		at, err := time.Parse(time.RFC3339, e.LC)
		if err != nil {
			at = time.Now()
		}
		h.setLocked(e.Address, e.Datapoint, e.Value, at)
	}
}

// OnEvent takes a reported value
func (h *Home) OnEvent(address, datapoint string, value any) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if previous, ok := h.values[address][datapoint]; ok && reflect.DeepEqual(previous, value) {
		return
	}
	h.setLocked(address, datapoint, value, time.Now())
}

func (h *Home) setLocked(address, datapoint string, value any, at time.Time) {
	if h.values[address] == nil {
		h.values[address] = map[string]any{}
		h.since[address] = map[string]int64{}
	}
	h.values[address][datapoint] = value
	h.since[address][datapoint] = at.Unix()
}

func (h *Home) value(address, datapoint string) (any, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	v, ok := h.values[address][datapoint]
	return v, ok
}
