package fakeccu

import (
	"fmt"
	"slices"
	"strconv"
	"strings"

	"ccu-addon-mui-server/pkg/rega"
)

// The fake CCU's home model in ReGa: channels, rooms and trades, names,
// favorites (rega.go runs the scripts)

// itemType says what a favorite list entry is, as get_favorites.tcl
// writes it, or "" if there is no such object.
func (c *CCU) itemType(id int64) string {
	if c.channelByID(id) != nil {
		return "CHANNEL"
	}
	for _, sv := range c.fixture.Sysvars {
		if sv.ID == id {
			return "SYSVAR"
		}
	}
	for _, p := range c.fixture.Programs {
		if p.ID == id {
			return "PROGRAM"
		}
	}
	return ""
}

func (c *CCU) getFavorites(username string) string {
	var b strings.Builder
	for _, f := range c.fixture.Favorites {
		if username != "" && !slices.Contains(f.Users, username) {
			continue
		}
		fmt.Fprintf(&b, "L\t%d\t%s\n", f.ID, f.Name)
		for _, id := range f.Items {
			if t := c.itemType(id); t != "" {
				fmt.Fprintf(&b, "I\t%d\t%s\n", id, t)
			}
		}
	}
	return b.String()
}

func (c *CCU) changeFavorite(values map[string]string) string {
	if values["ACTION"] == "create" {
		users := []string{}
		for _, u := range c.fixture.Users {
			if values["USERNAME"] == "" || u.Name == values["USERNAME"] {
				users = append(users, u.Name)
			}
		}
		id := c.nextID()
		c.fixture.Favorites = append(c.fixture.Favorites, Favorite{ID: id, Name: values["NAME"], Users: users, Items: []int64{}})
		return fmt.Sprintf("OK\t%d", id)
	}
	listID, _ := strconv.ParseInt(values["LIST_ID"], 10, 64)
	itemID, _ := strconv.ParseInt(values["ITEM_ID"], 10, 64)
	for i := range c.fixture.Favorites {
		f := &c.fixture.Favorites[i]
		if f.ID != listID {
			continue
		}
		previous := f.Name
		switch values["ACTION"] {
		case "rename":
			f.Name = values["NAME"]
		case "delete":
			c.fixture.Favorites = append(c.fixture.Favorites[:i], c.fixture.Favorites[i+1:]...)
		case "add", "remove":
			if c.itemType(itemID) == "" {
				return "NOT_FOUND"
			}
			f.Items = slices.DeleteFunc(f.Items, func(id int64) bool { return id == itemID })
			if values["ACTION"] == "add" {
				f.Items = append(f.Items, itemID)
			}
		}
		return "OK\t" + previous
	}
	return "NOT_FOUND"
}

// groups returns the rooms or trades for a ReGa list constant.
func (c *CCU) groups(listID string) *[]Group {
	switch listID {
	case "ID_ROOMS":
		return &c.fixture.Rooms
	case "ID_FUNCTIONS":
		return &c.fixture.Trades
	}
	return nil
}

// deviceProgramUsages finds the programs whose conditions or destinations
// name a channel of the device, as get_device_programs.tcl
func (c *CCU) deviceProgramUsages(address string) string {
	var b strings.Builder
	for _, ch := range c.fixture.Channels {
		if !strings.HasPrefix(ch.Address, address+":") {
			continue
		}
		for _, p := range c.fixture.Programs {
			used := false
			var branches []rega.ProgramBranch
			for _, rule := range p.Rules {
				for _, group := range rule.Groups {
					for _, cond := range group {
						used = used || cond.Channel == ch.ID
					}
				}
				branches = append(branches, rule.ProgramBranch)
			}
			if p.Else != nil {
				branches = append(branches, *p.Else)
			}
			for _, branch := range branches {
				for _, dest := range branch.Destinations {
					used = used || dest.Channel == ch.ID
				}
			}
			if used {
				fmt.Fprintf(&b, "P\t%d\t%s\t%s\n", p.ID, p.Name, ch.Address)
			}
		}
	}
	return b.String()
}

// isVirtualKey: a channel of the CCU's own HM-RCV-50 (BidCoS-RF) or
// HmIP-RCV-50 (HmIP-RCV-1) device
func isVirtualKey(address string) bool {
	return strings.HasPrefix(address, "BidCoS-RF:") || strings.HasPrefix(address, "HmIP-RCV-1:")
}

func writeGroups(groups []Group) string {
	var b strings.Builder
	for _, g := range groups {
		fmt.Fprintf(&b, "%d\t%s\n", g.ID, g.Name)
	}
	return b.String()
}

func (c *CCU) channelByID(id int64) *Channel {
	for i := range c.fixture.Channels {
		if c.fixture.Channels[i].ID == id {
			return &c.fixture.Channels[i]
		}
	}
	return nil
}

func (c *CCU) channelByAddress(iface, address string) *Channel {
	for i := range c.fixture.Channels {
		ch := &c.fixture.Channels[i]
		if ch.Address == address && (iface == "" || ch.Interface == iface) {
			return ch
		}
	}
	return nil
}

func deviceAddress(address string) string {
	device, _, _ := strings.Cut(address, ":")
	return device
}

func (c *CCU) getChannels(objectID string) string {
	var channels []*Channel
	if objectID == "ALL" {
		for i := range c.fixture.Channels {
			// Like get_channels.tcl, without the CCU's own virtual keys
			if !strings.HasSuffix(c.fixture.Channels[i].Address, ":0") && !isVirtualKey(c.fixture.Channels[i].Address) {
				channels = append(channels, &c.fixture.Channels[i])
			}
		}
	} else {
		id, _ := strconv.ParseInt(objectID, 10, 64)
		// Favorite lists hold channels among system variables and programs
		for _, f := range c.fixture.Favorites {
			if f.ID == id {
				for _, itemID := range f.Items {
					if ch := c.channelByID(itemID); ch != nil {
						channels = append(channels, ch)
					}
				}
			}
		}
		for _, g := range append(append([]Group{}, c.fixture.Rooms...), c.fixture.Trades...) {
			if g.ID != id {
				continue
			}
			for _, channelID := range g.Channels {
				if ch := c.channelByID(channelID); ch != nil {
					channels = append(channels, ch)
				}
			}
		}
	}

	var b strings.Builder
	// S lines once per device, with its first channel listed
	statusWritten := map[string]bool{}
	for _, ch := range channels {
		fmt.Fprintf(&b, "C\t%d\t%s\t%s\t%s\t%s\n", ch.ID, ch.Address, ch.Type, ch.Interface, ch.Name)
		fmt.Fprintf(&b, "M\t%s\t%s\n", memberOf(c.fixture.Rooms, ch.ID), memberOf(c.fixture.Trades, ch.ID))
		fmt.Fprintf(&b, "F\t%t\t%t\t%t\t%t\n", !ch.Hidden, !ch.ReadOnly, ch.Logged, ch.AES)
		if ch.Mode != nil {
			fmt.Fprintf(&b, "O\t%d\n", *ch.Mode)
		}
		if status := c.channelByAddress(ch.Interface, deviceAddress(ch.Address)+":0"); status != nil {
			fmt.Fprintf(&b, "A\t%s\n", status.Address)
			if !statusWritten[status.Address] {
				statusWritten[status.Address] = true
				for _, dp := range []string{"LOW_BAT", "LOWBAT", "UNREACH"} {
					if v, ok := status.Datapoints[dp]; ok {
						fmt.Fprintf(&b, "S\t%s\t%s\t%s\n", status.Address, dp, formatValue(v))
					}
				}
			}
		}
		for name, v := range ch.Datapoints {
			fmt.Fprintf(&b, "D\t%s\t%s\t%s\n", name, valueType(v), formatValue(v))
		}
	}
	return b.String()
}

// memberOf returns the ids of the groups containing a channel, comma separated.
func memberOf(groups []Group, channelID int64) string {
	var ids []string
	for _, g := range groups {
		for _, id := range g.Channels {
			if id == channelID {
				ids = append(ids, strconv.FormatInt(g.ID, 10))
			}
		}
	}
	return strings.Join(ids, ",")
}

func (c *CCU) getDeviceNames() string {
	var b strings.Builder
	for _, data := range c.fixture.Interfaces {
		for _, d := range data.Devices {
			address, _ := d["ADDRESS"].(string)
			if parent, _ := d["PARENT"].(string); parent != "" || address == "" {
				continue
			}
			name := c.fixture.DeviceNames[address]
			if name == "" {
				name = fmt.Sprintf("%v %s", d["TYPE"], address)
			}
			fmt.Fprintf(&b, "%s\t%s\n", address, name)
		}
	}
	return b.String()
}

func (c *CCU) setName(address, name string) string {
	if !strings.Contains(address, ":") {
		previous := c.fixture.DeviceNames[address]
		if previous == "" && c.channelByAddress("", address+":0") == nil && c.channelByAddress("", address+":1") == nil {
			return "NOT_FOUND"
		}
		if c.fixture.DeviceNames == nil {
			c.fixture.DeviceNames = map[string]string{}
		}
		c.fixture.DeviceNames[address] = name
		return "OK\t" + previous
	}
	ch := c.channelByAddress("", address)
	if ch == nil {
		return "NOT_FOUND"
	}
	previous := ch.Name
	ch.Name = name
	return "OK\t" + previous
}

func (c *CCU) setGroupMember(groupID, channelID string, member bool) string {
	gid, _ := strconv.ParseInt(groupID, 10, 64)
	cid, _ := strconv.ParseInt(channelID, 10, 64)
	if c.channelByID(cid) == nil {
		return "NOT_FOUND"
	}
	for _, groups := range []*[]Group{&c.fixture.Rooms, &c.fixture.Trades} {
		for i := range *groups {
			g := &(*groups)[i]
			if g.ID != gid {
				continue
			}
			kept := []int64{}
			for _, id := range g.Channels {
				if id != cid {
					kept = append(kept, id)
				}
			}
			if member {
				kept = append(kept, cid)
			}
			g.Channels = kept
			return "OK"
		}
	}
	return "NOT_FOUND"
}
