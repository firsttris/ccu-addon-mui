package fakeccu

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
)

// The HMServer's group administration (/pages/jpages/group/*,
// GroupAdministrationController): heating groups in GroupsFile, as the
// HMServer keeps them in /etc/config/groups.gson. A new group gets a
// virtual device INT000000<id> with its channels.

type groupsFile struct {
	Groups []fakeGroup `json:"groups"`
}

type fakeGroup struct {
	ID           int                    `json:"id"`
	GroupMembers []fakeGroupMember      `json:"groupMembers"`
	GroupType    map[string]interface{} `json:"groupType"`
	Properties   map[string]interface{} `json:"groupProperties"`
}

type fakeGroupMember struct {
	MemberType map[string]string      `json:"memberType"`
	Properties map[string]interface{} `json:"properties"`
	ID         string                 `json:"id"`
}

// groupTypes as the HMServer and the HmIP server define them
var groupTypes = map[string]map[string]interface{}{
	"hmip.heating.group": {"id": "hmip.heating.group", "label": "HmIP-Heizungssteuerung", "version": 131072},
	"HomeMatic.heating":  {"id": "HomeMatic.heating", "label": "Heating_Control", "version": 3},
}

func (c *CCU) readGroups() (groupsFile, error) {
	var groups groupsFile
	data, err := os.ReadFile(c.GroupsFile)
	if os.IsNotExist(err) {
		return groups, nil
	}
	if err != nil {
		return groups, err
	}
	err = json.Unmarshal(data, &groups)
	return groups, err
}

func (c *CCU) writeGroups(groups groupsFile) error {
	data, err := json.Marshal(groups)
	if err != nil {
		return err
	}
	return os.WriteFile(c.GroupsFile, data, 0o644)
}

// groupCandidates are the thermostat channels a group type may contain:
// HmIP ones for HmIP groups, BidCos ones for HomeMatic groups
func (c *CCU) groupCandidates(groupType string) []*Channel {
	var list []*Channel
	for i := range c.fixture.Channels {
		ch := &c.fixture.Channels[i]
		if ch.Type != "HEATING_CLIMATECONTROL_TRANSCEIVER" {
			continue
		}
		if (groupType == "hmip.heating.group") == (ch.Interface == "HmIP-RF") {
			list = append(list, ch)
		}
	}
	return list
}

func memberTypeOf(ch *Channel) string {
	if ch.Interface == "HmIP-RF" {
		return "WALLMOUNTED_THERMOSTAT"
	}
	return "HM-CC-RT-DN"
}

func (c *CCU) handleGroups(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	var params map[string]interface{}
	_ = json.Unmarshal(body, &params)
	session := strings.Contains(r.URL.RawQuery, "sid=@fakeSession1@")
	respond := func(ok bool, code, content string) {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"isSuccessful": ok, "errorCode": code, "content": content})
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.calls["HMServer "+strings.TrimPrefix(r.URL.Path, "/pages/jpages/group/")]++
	groups, err := c.readGroups()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	switch r.URL.Path {
	case "/pages/jpages/group/suitableGroupMembers":
		// No session needed, as in the HMServer
		groupType, _ := params["groupTypeId"].(string)
		inGroup := map[string]bool{}
		for _, g := range groups.Groups {
			for _, m := range g.GroupMembers {
				inGroup[m.ID] = true
			}
		}
		type member struct {
			ID           string `json:"id"`
			SerialNumber string `json:"serialNumber"`
			Type         string `json:"type"`
		}
		result := map[string][]member{"assignableGroupMembers": {}, "leftoverGroupMembers": {}}
		for _, ch := range c.groupCandidates(groupType) {
			m := member{ID: ch.Address, SerialNumber: ch.Address, Type: memberTypeOf(ch)}
			if inGroup[ch.Address] {
				result["leftoverGroupMembers"] = append(result["leftoverGroupMembers"], m)
			} else {
				result["assignableGroupMembers"] = append(result["assignableGroupMembers"], m)
			}
		}
		_ = json.NewEncoder(w).Encode(result)
	case "/pages/jpages/group/save":
		if !session {
			respond(false, "42", "${sessionInvalid}")
			return
		}
		groupType, _ := params["groupTypeId"].(string)
		typeInfo, ok := groupTypes[groupType]
		if !ok {
			respond(false, "43", "unknown group type")
			return
		}
		name, _ := params["groupName"].(string)
		name = latin1Unescape(name)
		deviceName, _ := params["groupDeviceName"].(string)
		forbid, _ := params["forbidSingleOperation"].(bool)
		var ids []string
		if list, ok := params["assignedDevicesIds"].([]interface{}); ok {
			for _, id := range list {
				ids = append(ids, fmt.Sprint(id))
			}
		}
		members := []fakeGroupMember{}
		for _, id := range ids {
			ch := c.channelByAddress("", id)
			if ch == nil {
				respond(false, "43", "unknown member "+id)
				return
			}
			members = append(members, fakeGroupMember{MemberType: map[string]string{"id": memberTypeOf(ch)}, Properties: map[string]interface{}{}, ID: id})
		}
		properties := map[string]interface{}{"NAME": name, "FORBID_SINGLE_OPERATION": forbid, "GROUP_DEVICE_NAME": deviceName}
		id := 0
		if isNew, _ := params["isNewGroup"].(bool); isNew {
			for _, g := range groups.Groups {
				if g.ID > id {
					id = g.ID
				}
			}
			id++
			groups.Groups = append(groups.Groups, fakeGroup{ID: id, GroupMembers: members, GroupType: typeInfo, Properties: properties})
			c.addGroupDevice(id, groupType)
		} else {
			groupID, _ := params["groupId"].(float64)
			id = int(groupID)
			found := false
			for i := range groups.Groups {
				if groups.Groups[i].ID == id {
					groups.Groups[i].GroupMembers = members
					groups.Groups[i].GroupType = typeInfo
					groups.Groups[i].Properties = properties
					found = true
				}
			}
			if !found {
				respond(false, "43", "unknown group")
				return
			}
		}
		if err := c.writeGroups(groups); err != nil {
			respond(false, "500", err.Error())
			return
		}
		respond(true, "", fmt.Sprint(id))
	case "/pages/jpages/group/delete":
		if !session {
			respond(false, "42", "${sessionInvalid}")
			return
		}
		groupID, _ := params["groupId"].(float64)
		kept := groups.Groups[:0]
		for _, g := range groups.Groups {
			if g.ID != int(groupID) {
				kept = append(kept, g)
			}
		}
		groups.Groups = kept
		if err := c.writeGroups(groups); err != nil {
			respond(false, "500", err.Error())
			return
		}
		respond(true, "", "[]")
	default:
		http.NotFound(w, r)
	}
}

// GroupDeviceAddress is the address of a group's virtual device
// (createVirtualDeviceSerialNumber in the WebUI)
func GroupDeviceAddress(id int) string {
	return fmt.Sprintf("INT%07d", id)
}

// addGroupDevice adds a new group's virtual device to the inbox, with the
// channels of an HmIP-HEATING (0 to 8) or HM-CC-VG-1 (1 to 3); c.mu is held
func (c *CCU) addGroupDevice(id int, groupType string) {
	address := GroupDeviceAddress(id)
	first, last := 1, 3
	if groupType == "hmip.heating.group" {
		first, last = 0, 8
	}
	maxID := int64(0)
	for _, ch := range c.fixture.Channels {
		if ch.ID > maxID {
			maxID = ch.ID
		}
	}
	for i := first; i <= last; i++ {
		maxID++
		c.fixture.Channels = append(c.fixture.Channels, Channel{
			ID: maxID, Address: fmt.Sprintf("%s:%d", address, i), Type: "HEATING_CLIMATECONTROL_TRANSCEIVER",
			Interface: "VirtualDevices", Name: fmt.Sprintf("HmIP-HEATING %s:%d", address, i), Datapoints: map[string]interface{}{},
		})
	}
	if c.fixture.DeviceNames == nil {
		c.fixture.DeviceNames = map[string]string{}
	}
	c.fixture.DeviceNames[address] = "HmIP-HEATING " + address
	c.fixture.Inbox = append(c.fixture.Inbox, address)
}

// setupGroupDevice is setup_group_device.tcl; c.mu is held
func (c *CCU) setupGroupDevice(values map[string]string) string {
	if c.groupMetadata == nil {
		c.groupMetadata = map[string]string{}
	}
	for _, list := range []struct{ key, value string }{{"MEMBERS", "true"}, {"OTHERS", "false"}} {
		for _, a := range strings.Split(values[list.key], "\t") {
			if a != "" {
				c.groupMetadata[a] = list.value
			}
		}
	}
	address := values["ADDRESS"]
	if _, ok := c.fixture.DeviceNames[address]; !ok {
		return "NOT_FOUND"
	}
	if values["RENAME"] == "1" {
		c.fixture.DeviceNames[address] = values["NAME"]
		for i := range c.fixture.Channels {
			ch := &c.fixture.Channels[i]
			if device, channel, ok := strings.Cut(ch.Address, ":"); ok && device == address {
				ch.Name = values["NAME"] + ":" + channel
			}
		}
	}
	for i, a := range c.fixture.Inbox {
		if a == address {
			c.fixture.Inbox = append(c.fixture.Inbox[:i], c.fixture.Inbox[i+1:]...)
			break
		}
	}
	return "OK"
}

// InHeatingGroup is the metadata inHeatingGroup of devices, by address
func (c *CCU) InHeatingGroup() map[string]string {
	c.mu.Lock()
	defer c.mu.Unlock()
	result := map[string]string{}
	keys := make([]string, 0, len(c.groupMetadata))
	for k := range c.groupMetadata {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		result[k] = c.groupMetadata[k]
	}
	return result
}

// latin1Unescape reads %XX as ISO-8859-1, as the HMServer's URLDecoder
func latin1Unescape(text string) string {
	var b strings.Builder
	for i := 0; i < len(text); i++ {
		if text[i] == '%' && i+2 < len(text) {
			if n, err := strconv.ParseUint(text[i+1:i+3], 16, 8); err == nil {
				b.WriteRune(rune(n))
				i += 2
				continue
			}
		}
		b.WriteByte(text[i])
	}
	return b.String()
}

// DeviceName is a device's name in the fake ReGa
func (c *CCU) DeviceName(address string) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.fixture.DeviceNames[address]
}
