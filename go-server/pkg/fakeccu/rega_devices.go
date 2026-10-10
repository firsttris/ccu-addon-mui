package fakeccu

import (
	"fmt"
	"slices"
	"strconv"
	"strings"
)

// The fake CCU's devices in ReGa: the inbox, replacing and deleting,
// problems, health and service messages (rega.go runs the scripts)

// device returns the description of a device and its interface.
func (c *CCU) device(address string) (map[string]any, string) {
	for iface, data := range c.fixture.Interfaces {
		for _, d := range data.Devices {
			if d["ADDRESS"] == address {
				return d, iface
			}
		}
	}
	return nil, ""
}

func (c *CCU) getInbox() string {
	var b strings.Builder
	for _, address := range c.fixture.Inbox {
		d, iface := c.device(address)
		if d == nil {
			continue
		}
		name := c.fixture.DeviceNames[address]
		if name == "" {
			name = fmt.Sprintf("%v %s", d["TYPE"], address)
		}
		fmt.Fprintf(&b, "%s\t%v\t%s\t%s\n", address, d["TYPE"], iface, name)
	}
	return b.String()
}

// deleteDevice removes a device with its channels everywhere; c.mu must be held.
// AddInboxDevice puts a new, not yet set up device with one channel into the
// inbox (for tests).
func (c *CCU) AddInboxDevice(iface, address, deviceType string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.addInboxDevice(iface, address, deviceType)
}

// addInboxDevice is AddInboxDevice with c.mu held
func (c *CCU) addInboxDevice(iface, address, deviceType string) {
	data := c.fixture.Interfaces[iface]
	if data == nil {
		data = &InterfaceData{}
		c.fixture.Interfaces[iface] = data
	}
	data.Devices = append(data.Devices,
		map[string]any{"ADDRESS": address, "TYPE": deviceType, "PARENT": "", "CHILDREN": []any{address + ":1"}, "PARAMSETS": []any{"MASTER"}, "VERSION": 1},
		map[string]any{"ADDRESS": address + ":1", "TYPE": "SWITCH", "PARENT": address, "PARENT_TYPE": deviceType, "INDEX": 1, "PARAMSETS": []any{"MASTER", "VALUES"}, "VERSION": 1},
	)
	c.fixture.Inbox = append(c.fixture.Inbox, address)
}

// replaceDevice moves the old device's place (channels, rooms, programs)
// to the new device, as replaceDevice does: the new device's own entries
// go, the old ones take its address.
func (c *CCU) replaceDevice(iface, oldAddress, newAddress string) bool {
	data := c.fixture.Interfaces[iface]
	oldFound, newFound := false, false
	for _, d := range data.Devices {
		oldFound = oldFound || d["ADDRESS"] == oldAddress
		newFound = newFound || d["ADDRESS"] == newAddress
	}
	if !oldFound || !newFound {
		return false
	}
	kept := data.Devices[:0]
	for _, d := range data.Devices {
		if d["ADDRESS"] == newAddress || d["PARENT"] == newAddress {
			continue
		}
		swap := func(v any) any {
			if a, ok := v.(string); ok && (a == oldAddress || strings.HasPrefix(a, oldAddress+":")) {
				return newAddress + strings.TrimPrefix(a, oldAddress)
			}
			return v
		}
		d["ADDRESS"], d["PARENT"] = swap(d["ADDRESS"]), swap(d["PARENT"])
		if children, ok := d["CHILDREN"].([]any); ok {
			for i := range children {
				children[i] = swap(children[i])
			}
		}
		kept = append(kept, d)
	}
	data.Devices = kept
	for i := range c.fixture.Channels {
		ch := &c.fixture.Channels[i]
		if ch.Interface == iface && deviceAddress(ch.Address) == oldAddress {
			ch.Address = newAddress + strings.TrimPrefix(ch.Address, oldAddress)
		}
	}
	if name, ok := c.fixture.DeviceNames[oldAddress]; ok {
		c.fixture.DeviceNames[newAddress] = name
		delete(c.fixture.DeviceNames, oldAddress)
	}
	c.fixture.Inbox = slices.DeleteFunc(c.fixture.Inbox, func(a string) bool { return a == newAddress })
	return true
}

func (c *CCU) deleteDevice(iface, address string) bool {
	data := c.fixture.Interfaces[iface]
	found := false
	kept := data.Devices[:0]
	for _, d := range data.Devices {
		if d["ADDRESS"] == address || d["PARENT"] == address {
			found = true
			continue
		}
		kept = append(kept, d)
	}
	data.Devices = kept
	if !found {
		return false
	}
	var removed []int64
	channels := c.fixture.Channels[:0]
	for _, ch := range c.fixture.Channels {
		if ch.Interface == iface && deviceAddress(ch.Address) == address {
			removed = append(removed, ch.ID)
			continue
		}
		channels = append(channels, ch)
	}
	c.fixture.Channels = channels
	for _, groups := range []*[]Group{&c.fixture.Rooms, &c.fixture.Trades} {
		for i := range *groups {
			g := &(*groups)[i]
			members := []int64{}
			for _, id := range g.Channels {
				gone := false
				for _, r := range removed {
					gone = gone || id == r
				}
				if !gone {
					members = append(members, id)
				}
			}
			g.Channels = members
		}
	}
	inbox := c.fixture.Inbox[:0]
	for _, a := range c.fixture.Inbox {
		if a != address {
			inbox = append(inbox, a)
		}
	}
	c.fixture.Inbox = inbox
	return true
}

func (c *CCU) getDeviceProblems() string {
	var b strings.Builder
	for _, ch := range c.fixture.Channels {
		if !strings.HasSuffix(ch.Address, ":0") || ch.Interface == "VirtualDevices" {
			continue
		}
		lowBat := ch.Datapoints["LOW_BAT"] == true || ch.Datapoints["LOWBAT"] == true
		unreach := ch.Datapoints["UNREACH"] == true
		if !lowBat && !unreach {
			continue
		}
		device := deviceAddress(ch.Address)
		roomID, roomName := "", ""
		if first := c.channelByAddress(ch.Interface, device+":1"); first != nil {
			for _, room := range c.fixture.Rooms {
				for _, id := range room.Channels {
					if id == first.ID && roomID == "" {
						roomID, roomName = strconv.FormatInt(room.ID, 10), room.Name
					}
				}
			}
		}
		name := c.fixture.DeviceNames[device]
		if name == "" {
			name = device
		}
		fmt.Fprintf(&b, "P\t%s\t%t\t%t\t%s\t%s\t%s\n", device, lowBat, unreach, roomID, roomName, name)
	}
	return b.String()
}

// The values get_device_health.tcl reports, as the fake has them (the time
// stamp is the fake's start)
var healthDatapoints = []string{"LOW_BAT", "LOWBAT", "OPERATING_VOLTAGE", "RSSI_DEVICE", "RSSI_PEER", "UNREACH",
	"STICKY_UNREACH", "CONFIG_PENDING", "UPDATE_PENDING", "DUTY_CYCLE", "SABOTAGE"}

func (c *CCU) getDeviceHealth() string {
	var b strings.Builder
	for _, ch := range c.fixture.Channels {
		if !strings.HasSuffix(ch.Address, ":0") || ch.Interface == "VirtualDevices" {
			continue
		}
		device := deviceAddress(ch.Address)
		deviceType := ""
		if data := c.fixture.Interfaces[ch.Interface]; data != nil {
			for _, d := range data.Devices {
				if d["ADDRESS"] == device {
					deviceType, _ = d["TYPE"].(string)
				}
			}
		}
		roomID, roomName := "", ""
		if first := c.channelByAddress(ch.Interface, device+":1"); first != nil {
			for _, room := range c.fixture.Rooms {
				for _, id := range room.Channels {
					if id == first.ID && roomID == "" {
						roomID, roomName = strconv.FormatInt(room.ID, 10), room.Name
					}
				}
			}
		}
		var values strings.Builder
		for _, name := range healthDatapoints {
			if v, ok := ch.Datapoints[name]; ok {
				fmt.Fprintf(&values, "%s=%v@%d;", name, v, c.Started.Unix())
			}
		}
		name := c.fixture.DeviceNames[device]
		if name == "" {
			name = device
		}
		fmt.Fprintf(&b, "H\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n", device, deviceType, ch.Interface, roomID, roomName, values.String(), name)
	}
	return b.String()
}

// serviceDatapoints raise a service message while true (or, for the error
// codes, not 0), in the order ReGa would number their alarms.
var serviceDatapoints = []string{
	"UNREACH", "STICKY_UNREACH", "LOW_BAT", "LOWBAT", "CONFIG_PENDING", "UPDATE_PENDING",
	"SABOTAGE", "STICKY_SABOTAGE", "ERROR_CODE", "DUTY_CYCLE", "DEVICE_IN_BOOTLOADER",
}

type serviceMessage struct {
	id        int64
	channel   *Channel
	datapoint string
}

func (c *CCU) serviceMessages() []serviceMessage {
	var messages []serviceMessage
	for i := range c.fixture.Channels {
		ch := &c.fixture.Channels[i]
		if !strings.HasSuffix(ch.Address, ":0") || ch.Interface == "VirtualDevices" {
			continue
		}
		for j, datapoint := range serviceDatapoints {
			value, ok := ch.Datapoints[datapoint]
			if !ok || value == false || value == nil || value == 0.0 || value == 0 {
				continue
			}
			messages = append(messages, serviceMessage{id: ch.ID*100 + int64(j), channel: ch, datapoint: datapoint})
		}
	}
	return messages
}

func (c *CCU) getServiceMessages() string {
	var b strings.Builder
	for _, m := range c.serviceMessages() {
		device := deviceAddress(m.channel.Address)
		roomID, roomName := "", ""
		if first := c.channelByAddress(m.channel.Interface, device+":1"); first != nil {
			for _, room := range c.fixture.Rooms {
				for _, id := range room.Channels {
					if id == first.ID && roomID == "" {
						roomID, roomName = strconv.FormatInt(room.ID, 10), room.Name
					}
				}
			}
		}
		name := c.fixture.DeviceNames[device]
		if name == "" {
			name = device
		}
		fmt.Fprintf(&b, "S\t%d\t%s\t%s\t2026-01-15 09:00:00\t%s\t%s\t%s\t%s\n",
			m.id, m.datapoint, formatValue(m.channel.Datapoints[m.datapoint]), device, roomID, roomName, name)
	}
	return b.String()
}
