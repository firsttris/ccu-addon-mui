package occulite

import (
	"cmp"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/home"
	"ccu-addon-mui-server/pkg/logger"
)

// The home model of openccu-lite (home.go): devices and channels

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
		Datapoints: map[string]any{},
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
		if mode, ok := data.Modes[ref]; ok {
			c.Mode = &mode
		}
	})
	return c, true
}

// readValues reads a channel's values once, for what the state store does
// not have: HmIP and virtual channels answer from the process's cache,
// BidCos asks the device and waits for the event stream instead
func (h *Home) readValues(ch channelInfo) {
	h.mu.Lock()
	// Once per channel, also when the state store had some of its values:
	// it keeps only the datapoints occulited's cards draw (devstate/keys.go)
	done := h.read[ch.desc.Address]
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
	slices.SortFunc(list, func(a, b home.Channel) int { return cmp.Compare(a.Name, b.Name) })
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
	if err := h.client.PatchObject(ctx, ref, map[string]any{"name": name}); err != nil {
		return "", "", err
	}
	return home.SetOK, previous, nil
}
