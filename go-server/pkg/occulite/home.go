package occulite

import (
	"context"
	"fmt"
	"hash/fnv"
	"reflect"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/home"
	"ccu-addon-mui-server/pkg/logger"
)

// RPC is the part of ccurpc.Client the home model reads devices and values
// with: the interface processes on the system's local ports
type RPC interface {
	InterfaceNames() []string
	ListDevices(iface string) ([]ccurpc.DeviceDescription, error)
	GetParamsetDescription(iface, address, paramsetKey string) (ccurpc.ParamsetDescription, error)
	GetParamset(iface, address, paramsetKey string) (map[string]interface{}, error)
	CallRaw(iface, method string, args ...interface{}) (interface{}, error)
}

// Home is openccu-lite's home model for the add-on: names, rooms and
// functions from occulited's metadata API, the devices and channels from
// the interface processes, their values from the state store and the event
// stream, and what the CCU kept as ReGa metadata in a file of its own.
type Home struct {
	unsupported
	client *Client
	rpc    RPC
	store  *store

	mu sync.Mutex
	// The last value of every datapoint by channel address, and since when
	// it has it (Unix seconds)
	values map[string]map[string]interface{}
	since  map[string]map[string]int64
	// Channels whose values were read once (HmIP and virtual channels
	// answer from the process's cache; BidCos would ask the device)
	read map[string]bool
	// The interface of every device and channel address
	interfaces map[string]string
}

var _ home.Source = (*Home)(nil)

// NewHome returns the home model behind client and rpc; dataDir holds its
// own data (mui-lite.json)
func NewHome(client *Client, rpc RPC, dataDir string) (*Home, error) {
	s, err := openStore(dataDir)
	if err != nil {
		return nil, err
	}
	return &Home{
		client: client, rpc: rpc, store: s,
		values: map[string]map[string]interface{}{}, since: map[string]map[string]int64{},
		read: map[string]bool{}, interfaces: map[string]string{},
	}, nil
}

const callTimeout = 15 * time.Second

func (h *Home) context() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), callTimeout)
}

func (h *Home) snapshot() (Snapshot, error) {
	ctx, cancel := h.context()
	defer cancel()
	return h.client.Snapshot(ctx)
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
func (h *Home) OnEvent(address, datapoint string, value interface{}) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if previous, ok := h.values[address][datapoint]; ok && reflect.DeepEqual(previous, value) {
		return
	}
	h.setLocked(address, datapoint, value, time.Now())
}

func (h *Home) setLocked(address, datapoint string, value interface{}, at time.Time) {
	if h.values[address] == nil {
		h.values[address] = map[string]interface{}{}
		h.since[address] = map[string]int64{}
	}
	h.values[address][datapoint] = value
	h.since[address][datapoint] = at.Unix()
}

func (h *Home) value(address, datapoint string) (interface{}, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	v, ok := h.values[address][datapoint]
	return v, ok
}

// --- Rooms and functions ---------------------------------------------------

// groupList maps the app's lists to openccu-lite's enums
var groupEnums = map[string]string{"rooms": "room", "funcs": "function"}

func nodes(snapshot Snapshot, enumID string) []home.NamedObject {
	list := []home.NamedObject{}
	if enum, ok := snapshot.Enums[enumID]; ok {
		enum.Walk(enumID, func(path string, node Node, depth int) {
			list = append(list, home.NamedObject{ID: ID(path), Name: node.Name})
		})
	}
	return list
}

// pathOf finds the node path with the app's id
func pathOf(snapshot Snapshot, enumID string, id int64) string {
	found := ""
	if enum, ok := snapshot.Enums[enumID]; ok {
		enum.Walk(enumID, func(path string, node Node, depth int) {
			if ID(path) == id {
				found = path
			}
		})
	}
	return found
}

func (h *Home) GetRooms() ([]home.NamedObject, error) {
	snapshot, err := h.snapshot()
	if err != nil {
		return nil, err
	}
	return nodes(snapshot, "room"), nil
}

func (h *Home) GetTrades() ([]home.NamedObject, error) {
	snapshot, err := h.snapshot()
	if err != nil {
		return nil, err
	}
	return nodes(snapshot, "function"), nil
}

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

// slug makes a node id of a name ([a-z0-9-], ≤ 32), umlauts transcribed
// as occulited's import does
func slug(name string) string {
	replacer := strings.NewReplacer("ä", "ae", "ö", "oe", "ü", "ue", "ß", "ss")
	id := strings.Trim(nonSlug.ReplaceAllString(replacer.Replace(strings.ToLower(name)), "-"), "-")
	if len(id) > 32 {
		id = strings.Trim(id[:32], "-")
	}
	if id == "" {
		id = "raum"
	}
	return id
}

// uniqueSlug is the node id of a name that is not taken yet: "-2", "-3", …
// appended, within the 32 characters of a node id
func uniqueSlug(name string, taken map[string]bool) string {
	base := slug(name)
	id := base
	for n := 2; taken[id]; n++ {
		suffix := fmt.Sprintf("-%d", n)
		id = strings.TrimRight(base[:min(len(base), 32-len(suffix))], "-") + suffix
	}
	return id
}

func (h *Home) CreateGroup(list, name string) (string, int64, error) {
	enumID, ok := groupEnums[list]
	if !ok {
		return home.SetNotFound, 0, nil
	}
	snapshot, err := h.snapshot()
	if err != nil {
		return "", 0, err
	}
	taken := map[string]bool{}
	if enum, ok := snapshot.Enums[enumID]; ok {
		for _, node := range enum.Tree {
			taken[node.ID] = true
		}
	}
	id := uniqueSlug(name, taken)
	ctx, cancel := h.context()
	defer cancel()
	if err := h.client.CreateNode(ctx, enumID, "", id, name); err != nil {
		return "", 0, err
	}
	return home.SetOK, ID(enumID + "/" + id), nil
}

func (h *Home) changeNode(list string, id int64, fn func(ctx context.Context, path string) error) (string, string, error) {
	enumID, ok := groupEnums[list]
	if !ok {
		return home.SetNotFound, "", nil
	}
	snapshot, err := h.snapshot()
	if err != nil {
		return "", "", err
	}
	path := pathOf(snapshot, enumID, id)
	if path == "" {
		return home.SetNotFound, "", nil
	}
	previous := ""
	for _, g := range nodes(snapshot, enumID) {
		if g.ID == id {
			previous = g.Name
		}
	}
	ctx, cancel := h.context()
	defer cancel()
	if err := fn(ctx, path); err != nil {
		return "", "", err
	}
	return home.SetOK, previous, nil
}

func (h *Home) RenameGroup(list string, id int64, name string) (string, string, error) {
	return h.changeNode(list, id, func(ctx context.Context, path string) error { return h.client.RenameNode(ctx, path, name) })
}

func (h *Home) DeleteGroup(list string, id int64) (string, string, error) {
	return h.changeNode(list, id, h.client.DeleteNode)
}

// SetGroupMember puts a channel into a room or function, or takes it out
func (h *Home) SetGroupMember(groupID, channelID int64, member bool) (string, error) {
	snapshot, err := h.snapshot()
	if err != nil {
		return "", err
	}
	path := pathOf(snapshot, "room", groupID)
	if path == "" {
		path = pathOf(snapshot, "function", groupID)
	}
	ch, found := h.channelByID(channelID)
	if path == "" || !found {
		return home.SetNotFound, nil
	}
	ref := Ref(ch.iface, ch.desc.Address)
	object := snapshot.Objects[ref]
	enums := []string{}
	for _, e := range channelEnums(snapshot, ch) {
		if e != path {
			enums = append(enums, e)
		}
	}
	if member {
		enums = append(enums, path)
	}
	patch := map[string]interface{}{"enums": enums}
	if object.Name == "" {
		// The store never invents objects: a new one needs its name
		patch["name"] = defaultName(snapshot, ref, ch.desc.ParentType)
	}
	ctx, cancel := h.context()
	defer cancel()
	if err := h.client.PatchObject(ctx, ref, patch); err != nil {
		return "", err
	}
	return home.SetOK, nil
}

// --- Devices and channels ------------------------------------------------

type channelInfo struct {
	iface string
	desc  ccurpc.DeviceDescription
}

// channels lists the channels of all interfaces, without the maintenance
// channels (":0") and the internal ones
func (h *Home) channels() []channelInfo {
	var list []channelInfo
	interfaces := map[string]string{}
	for _, iface := range h.rpc.InterfaceNames() {
		descriptions, err := h.rpc.ListDevices(iface)
		if err != nil {
			logger.Debugf("listDevices %s: %v", iface, err)
			continue
		}
		for _, d := range descriptions {
			interfaces[d.Address] = iface
			// flags: 1 visible, 2 internal; the central's virtual keys are
			// not channels of the home (getVirtualKeys lists them)
			if d.Parent == "" || d.Index == 0 || d.Flags&1 == 0 || d.Flags&2 != 0 || isCentral(d.ParentType) {
				continue
			}
			list = append(list, channelInfo{iface: iface, desc: d})
		}
	}
	h.mu.Lock()
	h.interfaces = interfaces
	h.mu.Unlock()
	return list
}

func (h *Home) interfaceOf(address string) string {
	h.mu.Lock()
	iface := h.interfaces[address]
	h.mu.Unlock()
	if iface == "" {
		h.channels()
		h.mu.Lock()
		iface = h.interfaces[address]
		h.mu.Unlock()
	}
	return iface
}

// channelByID finds a channel by the app's id
func (h *Home) channelByID(channelID int64) (channelInfo, bool) {
	for _, ch := range h.channels() {
		if ID(Ref(ch.iface, ch.desc.Address)) == channelID {
			return ch, true
		}
	}
	return channelInfo{}, false
}

// channelEnums are the rooms and functions of a channel: the channel
// object's own. Rooms on a device object do not reach its channels, as in
// occulited's own app (Sebastian in #191).
func channelEnums(snapshot Snapshot, ch channelInfo) []string {
	return snapshot.Objects[Ref(ch.iface, ch.desc.Address)].Enums
}

// defaultName is a name for a device or channel without one, as the CCU
// names them: "<type> <address>", with the type of the device
func defaultName(snapshot Snapshot, ref, deviceType string) string {
	iface, address, _ := SplitRef(ref)
	device, index, isChannel := strings.Cut(address, ":")
	if isChannel {
		if parent, ok := snapshot.Objects[Ref(iface, device)]; ok && parent.Name != "" {
			return parent.Name + ":" + index
		}
	}
	if deviceType != "" {
		return deviceType + " " + address
	}
	return address
}

func (h *Home) channel(snapshot Snapshot, ch channelInfo) (home.Channel, bool) {
	d := ch.desc
	description, err := h.rpc.GetParamsetDescription(ch.iface, d.Address, "VALUES")
	if err != nil || len(description) == 0 {
		return home.Channel{}, false
	}
	h.readValues(ch)
	ref := Ref(ch.iface, d.Address)
	name := snapshot.Objects[ref].Name
	if name == "" {
		name = defaultName(snapshot, ref, d.ParentType)
	}
	id := ID(ref)
	c := home.Channel{
		ID: id, Address: d.Address, Name: name, Type: d.Type, InterfaceName: ch.iface,
		Datapoints: map[string]interface{}{},
	}
	for key, parameter := range description {
		if value, ok := h.value(d.Address, key); ok {
			c.Datapoints[key] = value
		} else {
			c.Datapoints[key] = parameter.Default
		}
	}
	// The device's maintenance channel reports battery and reachability
	status := d.Parent + ":0"
	c.StatusAddress = status
	c.Status = map[string]bool{}
	for _, key := range []string{"UNREACH", "LOW_BAT", "LOWBAT"} {
		if value, ok := h.value(status, key); ok {
			if b, isBool := value.(bool); isBool {
				if key == "LOWBAT" {
					key = "LOW_BAT"
				}
				c.Status[key] = c.Status[key] || b
			}
		}
	}
	for _, path := range channelEnums(snapshot, ch) {
		switch {
		case strings.HasPrefix(path, "room/"):
			c.Rooms = append(c.Rooms, ID(path))
		case strings.HasPrefix(path, "function/"):
			c.Trades = append(c.Trades, ID(path))
		}
	}
	h.store.read(func(data *ownData) {
		c.Tile = data.Tiles[id]
		if mode, ok := data.Modes[ref]; ok {
			c.Mode = &mode
		}
	})
	return c, true
}

// readValues reads a channel's values once when the state store did not
// have them: HmIP and virtual channels answer from the process's cache,
// BidCos asks the device and waits for the event stream instead
func (h *Home) readValues(ch channelInfo) {
	h.mu.Lock()
	done := h.read[ch.desc.Address] || len(h.values[ch.desc.Address]) > 0
	h.read[ch.desc.Address] = true
	h.mu.Unlock()
	if done || strings.HasPrefix(ch.iface, "BidCos") {
		return
	}
	values, err := h.rpc.GetParamset(ch.iface, ch.desc.Address, "VALUES")
	if err != nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for key, value := range values {
		if _, known := h.values[ch.desc.Address][key]; !known {
			h.setLocked(ch.desc.Address, key, value, time.Now())
		}
	}
}

func (h *Home) GetAllChannels() ([]home.Channel, error) {
	snapshot, err := h.snapshot()
	if err != nil {
		return nil, err
	}
	return h.channelsOf(snapshot, h.channels()), nil
}

// channelsOf builds the app's channels, sorted by name
func (h *Home) channelsOf(snapshot Snapshot, channels []channelInfo) []home.Channel {
	list := []home.Channel{}
	for _, ch := range channels {
		if c, ok := h.channel(snapshot, ch); ok {
			list = append(list, c)
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Name < list[j].Name })
	return list
}

// GetChannels returns the channels of a room, a function or a favorite list
func (h *Home) GetChannels(objectID string) ([]home.Channel, error) {
	id, err := strconv.ParseInt(objectID, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid id %q", objectID)
	}
	snapshot, err := h.snapshot()
	if err != nil {
		return nil, err
	}
	var favorite *favoriteList
	h.store.read(func(data *ownData) {
		for i := range data.Favorites {
			if data.Favorites[i].ID == id {
				list := data.Favorites[i]
				favorite = &list
			}
		}
	})
	// Only the members are built, as the CCU's script visits only them
	var members []channelInfo
	for _, ch := range h.channels() {
		if favorite != nil {
			if slices.Contains(favorite.Items, ID(Ref(ch.iface, ch.desc.Address))) {
				members = append(members, ch)
			}
			continue
		}
		for _, path := range channelEnums(snapshot, ch) {
			if (strings.HasPrefix(path, "room/") || strings.HasPrefix(path, "function/")) && ID(path) == id {
				members = append(members, ch)
				break
			}
		}
	}
	channels := h.channelsOf(snapshot, members)
	if favorite == nil {
		return channels, nil
	}
	// A favorite list keeps its order
	byID := map[int64]home.Channel{}
	for _, c := range channels {
		byID[c.ID] = c
	}
	list := []home.Channel{}
	for _, item := range favorite.Items {
		if c, ok := byID[item]; ok {
			list = append(list, c)
		}
	}
	return list, nil
}

// GetDeviceNames returns the names of devices and channels by address
func (h *Home) GetDeviceNames() (map[string]string, error) {
	snapshot, err := h.snapshot()
	if err != nil {
		return nil, err
	}
	names := map[string]string{}
	for ref, object := range snapshot.Objects {
		_, address, ok := SplitRef(ref)
		if !ok || object.Orphaned || object.Name == "" {
			continue
		}
		names[address] = object.Name
	}
	return names, nil
}

// SetName renames a device or channel; the object is created when the
// store has none yet (a newly paired device)
func (h *Home) SetName(address, name string) (string, string, error) {
	iface := h.interfaceOf(address)
	if iface == "" {
		return home.SetNotFound, "", nil
	}
	snapshot, err := h.snapshot()
	if err != nil {
		return "", "", err
	}
	ref := Ref(iface, address)
	previous := snapshot.Objects[ref].Name
	ctx, cancel := h.context()
	defer cancel()
	if err := h.client.PatchObject(ctx, ref, map[string]interface{}{"name": name}); err != nil {
		return "", "", err
	}
	return home.SetOK, previous, nil
}

// --- Operating ----------------------------------------------------------

// SetDatapoint sets a value through the interface process, typed as its
// description says (the app sends text, as for the ReGa)
func (h *Home) SetDatapoint(iface, address, attribute, value string) (string, string, error) {
	description, err := h.rpc.GetParamsetDescription(iface, address, "VALUES")
	if err != nil {
		return home.SetNotFound, "", nil
	}
	parameter, ok := description[attribute]
	if !ok {
		return home.SetNotFound, "", nil
	}
	typed, err := typedValue(parameter.Type, value)
	if err != nil {
		return "", "", err
	}
	previous := ""
	if v, ok := h.value(address, attribute); ok {
		previous = fmt.Sprint(v)
	}
	if _, err := h.rpc.CallRaw(iface, "setValue", address, attribute, typed); err != nil {
		return "", "", err
	}
	return home.SetOK, previous, nil
}

func typedValue(kind, value string) (interface{}, error) {
	switch kind {
	case "BOOL", "ACTION":
		return value == "true" || value == "1", nil
	case "FLOAT":
		return strconv.ParseFloat(value, 64)
	case "INTEGER", "ENUM":
		if n, err := strconv.Atoi(value); err == nil {
			return n, nil
		}
		f, err := strconv.ParseFloat(value, 64)
		return int(f), err
	default:
		return value, nil
	}
}

// --- The add-on's own data ---------------------------------------------

func (h *Home) GetLayout(id int64) (string, string, error) {
	layout := ""
	h.store.read(func(data *ownData) { layout = data.Layouts[id] })
	return home.SetOK, layout, nil
}

func (h *Home) SetLayout(id int64, layout string) (string, string, error) {
	err := h.store.change(func(data *ownData) error {
		if layout == "" {
			delete(data.Layouts, id)
		} else {
			data.Layouts[id] = layout
		}
		return nil
	})
	return home.SetOK, "", err
}

func (h *Home) SetChannelTile(id int64, tile string) (string, string, error) {
	err := h.store.change(func(data *ownData) error {
		if tile == "" {
			delete(data.Tiles, id)
		} else {
			data.Tiles[id] = tile
		}
		return nil
	})
	return home.SetOK, "", err
}

func (h *Home) SetChannelMode(iface, address string, mode int) (string, error) {
	err := h.store.change(func(data *ownData) error {
		data.Modes[Ref(iface, address)] = mode
		return nil
	})
	return home.SetOK, err
}

// GetFavorites returns the favorite lists the user sees (lists without
// users are everyone's)
func (h *Home) GetFavorites(username string) ([]home.Favorite, error) {
	list := []home.Favorite{}
	h.store.read(func(data *ownData) {
		for _, f := range data.Favorites {
			if len(f.Users) > 0 && !contains(f.Users, username) {
				continue
			}
			favorite := home.Favorite{ID: f.ID, Name: f.Name, Items: []home.FavoriteItem{}}
			for _, item := range f.Items {
				favorite.Items = append(favorite.Items, home.FavoriteItem{ID: item, Type: "CHANNEL"})
			}
			list = append(list, favorite)
		}
	})
	return list, nil
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// ChangeFavorite creates, renames or deletes a list, or adds or removes a
// channel (openccu-lite has no system variables or programs to add)
func (h *Home) ChangeFavorite(change home.FavoriteChange) (string, string, error) {
	result, value := home.SetNotFound, ""
	err := h.store.change(func(data *ownData) error {
		if change.Action == home.FavoriteCreate {
			id := data.NextID
			data.NextID++
			list := favoriteList{ID: id, Name: change.Name, Items: []int64{}}
			if change.Username != "" {
				list.Users = []string{change.Username}
			}
			data.Favorites = append(data.Favorites, list)
			result, value = home.SetOK, strconv.FormatInt(id, 10)
			return nil
		}
		for i := range data.Favorites {
			f := &data.Favorites[i]
			if f.ID != change.ListID {
				continue
			}
			result = home.SetOK
			switch change.Action {
			case home.FavoriteRename:
				value, f.Name = f.Name, change.Name
			case home.FavoriteDelete:
				value = f.Name
				data.Favorites = append(data.Favorites[:i], data.Favorites[i+1:]...)
			case home.FavoriteAdd:
				value = f.Name
				for _, item := range f.Items {
					if item == change.ItemID {
						return nil
					}
				}
				f.Items = append(f.Items, change.ItemID)
			case home.FavoriteRemove:
				value = f.Name
				items := f.Items[:0]
				for _, item := range f.Items {
					if item != change.ItemID {
						items = append(items, item)
					}
				}
				f.Items = items
			}
			return nil
		}
		return nil
	})
	return result, value, err
}

// --- Pairing ----------------------------------------------------------

// devices lists the devices (not channels) of all interfaces
func (h *Home) devices() []channelInfo {
	var list []channelInfo
	for _, iface := range h.rpc.InterfaceNames() {
		descriptions, err := h.rpc.ListDevices(iface)
		if err != nil {
			continue
		}
		for _, d := range descriptions {
			if d.Parent == "" {
				list = append(list, channelInfo{iface: iface, desc: d})
			}
		}
	}
	return list
}

// inboxSkipped are no devices to accept: the central's virtual remotes and
// the heating groups' devices (VirtualDevices), which occulited names
func inboxSkipped(iface string, d ccurpc.DeviceDescription) bool {
	return iface == "VirtualDevices" || strings.HasSuffix(d.Type, "RCV-50") || d.Address == "BidCoS-RF" || d.Address == "BidCoS-Wir"
}

// GetInbox: openccu-lite has no inbox; a newly paired device is usable at
// once, but has no object in the metadata store until it gets a name. Those
// devices are the new ones.
func (h *Home) GetInbox() ([]home.InboxDevice, error) {
	snapshot, err := h.snapshot()
	if err != nil {
		return nil, err
	}
	inbox := []home.InboxDevice{}
	for _, d := range h.devices() {
		if inboxSkipped(d.iface, d.desc) {
			continue
		}
		if _, named := snapshot.Objects[Ref(d.iface, d.desc.Address)]; named {
			continue
		}
		inbox = append(inbox, home.InboxDevice{
			Address: d.desc.Address, Type: d.desc.Type, InterfaceName: d.iface,
			Name: d.desc.Type + " " + d.desc.Address,
		})
	}
	sort.Slice(inbox, func(i, j int) bool { return inbox[i].Address < inbox[j].Address })
	return inbox, nil
}

// AcceptDevice gives a new device its object, named as the CCU names it
// ("<type> <address>"), so it leaves the inbox; renaming follows in the
// app as on a CCU
func (h *Home) AcceptDevice(address string) (string, error) {
	for _, d := range h.devices() {
		if d.desc.Address != address {
			continue
		}
		ctx, cancel := h.context()
		defer cancel()
		err := h.client.PatchObject(ctx, Ref(d.iface, address), map[string]interface{}{"name": d.desc.Type + " " + address})
		if err != nil {
			return "", err
		}
		return home.SetOK, nil
	}
	return home.SetNotFound, nil
}

// isCentral: the central's own device, whose channels are its virtual keys
func isCentral(deviceType string) bool {
	return deviceType == "HM-RCV-50" || deviceType == "HmIP-RCV-50"
}

// GetVirtualKeys lists the central's virtual keys: the channels of its
// HM-RCV-50 and HmIP-RCV-50, named from the metadata store. openccu-lite
// has no programs, so none uses them.
func (h *Home) GetVirtualKeys() ([]home.VirtualKey, error) {
	snapshot, err := h.snapshot()
	if err != nil {
		return nil, err
	}
	keys := []home.VirtualKey{}
	for _, iface := range h.rpc.InterfaceNames() {
		descriptions, err := h.rpc.ListDevices(iface)
		if err != nil {
			continue
		}
		for _, d := range descriptions {
			if d.Parent == "" || d.Index == 0 || !isCentral(d.ParentType) {
				continue
			}
			ref := Ref(iface, d.Address)
			name := snapshot.Objects[ref].Name
			if name == "" {
				name = d.ParentType + " " + d.Address
			}
			keys = append(keys, home.VirtualKey{ID: ID(ref), Address: d.Address, InterfaceName: iface, Name: name})
		}
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i].Address < keys[j].Address })
	return keys, nil
}
