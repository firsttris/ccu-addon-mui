// Package heatinggroups reads the CCU's heating groups from
// /etc/config/groups.gson, which the HMServer keeps and the WebUI reads
// with CCU.getHeatingGroupList (api/methods/ccu/getheatinggrouplist.tcl).
// Creating and changing groups stays with the HMServer (the WebUI's
// "Einstellungen › Gruppen", /pages/jpages/group/*).
package heatinggroups

import (
	"encoding/json"
	"errors"
	"os"
	"regexp"
	"sort"
	"strings"
)

// ErrNoFile: the CCU has no groups file (no groups yet, or not a CCU)
var ErrNoFile = errors.New("no groups file")

// Member is a channel in a group
type Member struct {
	Address string `json:"address"`
	// The kind of member, e.g. RADIATOR_THERMOSTAT, HM-CC-RT-DN
	Type string `json:"type"`
}

// Group is a heating group
type Group struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	// The group type: hmip.heating.group or HomeMatic.heating
	Type      string `json:"type"`
	TypeLabel string `json:"typeLabel,omitempty"`
	// The virtual device that operates the group (INT0000001), if named
	DeviceAddress string `json:"deviceAddress,omitempty"`
	DeviceName    string `json:"deviceName,omitempty"`
	// Members may not be operated on their own
	ForbidSingleOperation bool     `json:"forbidSingleOperation"`
	Members               []Member `json:"members"`
}

type rawGroup struct {
	ID           int64 `json:"id"`
	GroupMembers []struct {
		ID         string `json:"id"`
		MemberType struct {
			ID string `json:"id"`
		} `json:"memberType"`
	} `json:"groupMembers"`
	GroupType struct {
		ID    string `json:"id"`
		Label string `json:"label"`
	} `json:"groupType"`
	GroupProperties map[string]interface{} `json:"groupProperties"`
}

// GROUP_DEVICE_NAME ends with the device's address ("IP-Gruppe-1 INT0000001")
var deviceAddressRegex = regexp.MustCompile(`\b(INT\d{7})\s*$`)

// Read reads the groups file. Its groups sit in arrays below the top
// level, which the WebUI walks without naming the key (ic_functions.js,
// addHintHeatingGroupDevice).
func Read(path string) ([]Group, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNoFile
	}
	if err != nil {
		return nil, err
	}
	var top map[string]json.RawMessage
	if err := json.Unmarshal(data, &top); err != nil {
		return nil, err
	}
	keys := make([]string, 0, len(top))
	for key := range top {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	groups := []Group{}
	for _, key := range keys {
		var list []rawGroup
		if json.Unmarshal(top[key], &list) != nil {
			continue
		}
		for _, raw := range list {
			groups = append(groups, convert(raw))
		}
	}
	return groups, nil
}

func convert(raw rawGroup) Group {
	text := func(key string) string {
		s, _ := raw.GroupProperties[key].(string)
		return strings.TrimSpace(s)
	}
	group := Group{
		ID: raw.ID, Name: text("NAME"), Type: raw.GroupType.ID, TypeLabel: raw.GroupType.Label,
		DeviceName: text("GROUP_DEVICE_NAME"), Members: []Member{},
	}
	group.ForbidSingleOperation, _ = raw.GroupProperties["FORBID_SINGLE_OPERATION"].(bool)
	if m := deviceAddressRegex.FindStringSubmatch(group.DeviceName); m != nil {
		group.DeviceAddress = m[1]
	}
	for _, member := range raw.GroupMembers {
		group.Members = append(group.Members, Member{Address: member.ID, Type: member.MemberType.ID})
	}
	return group
}
