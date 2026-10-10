package occulite

import (
	"cmp"
	"slices"
	"strings"

	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/home"
)

// The home model of openccu-lite (home.go): pairing

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
	slices.SortFunc(inbox, func(a, b home.InboxDevice) int { return cmp.Compare(a.Address, b.Address) })
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
		err := h.client.PatchObject(ctx, Ref(d.iface, address), map[string]any{"name": d.desc.Type + " " + address})
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
	slices.SortFunc(keys, func(a, b home.VirtualKey) int { return cmp.Compare(a.Address, b.Address) })
	return keys, nil
}
