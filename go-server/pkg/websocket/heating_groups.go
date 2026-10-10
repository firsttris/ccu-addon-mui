package websocket

import (
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/backup"
	"ccu-addon-mui-server/pkg/heatinggroups"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
)

// Where the HMServer keeps the heating groups (CCU.getHeatingGroupList)
var groupsFile = "/etc/config/groups.gson"

// SetGroupsFile sets where groups.gson is (for tests)
func SetGroupsFile(path string) {
	if path != "" {
		groupsFile = path
	}
}

// GroupService keeps the heating groups somewhere other than the CCU's
// HMServer: on openccu-lite occulited's /api/system/v1/groups, which also
// names the group's device and marks its members (no ReGa step after)
type GroupService interface {
	List() ([]heatinggroups.Group, error)
	SuitableMembers(groupType string) (backup.SuitableMembers, error)
	// Save creates (ID 0) or changes a group and returns its id
	Save(change backup.GroupChange) (int, error)
	Delete(id int) error
}

// SetGroupService keeps the heating groups with service instead of the
// HMServer
func (s *Server) SetGroupService(service GroupService) {
	s.groups = service
}

// listGroups reads the heating groups
func (s *Server) listGroups() ([]heatinggroups.Group, error) {
	if s.groups != nil {
		return s.groups.List()
	}
	groups, err := heatinggroups.Read(groupsFile)
	if errors.Is(err, heatinggroups.ErrNoFile) {
		return []heatinggroups.Group{}, nil
	}
	return groups, err
}

type heatingGroupsResponse struct {
	Type      string                `json:"type"`
	RequestID string                `json:"requestId,omitempty"`
	Groups    []heatinggroups.Group `json:"groups"`
}

// handleHeatingGroups lists the heating groups, for administrators as
// CCU.getHeatingGroupList (LEVEL ADMIN); without the file there are none
func (s *Server) handleHeatingGroups(client *Client, requestID string) {
	if client.level != auth.LevelAdmin {
		s.sendRequestError(client, requestID, "only administrators may see the heating groups", "FORBIDDEN")
		return
	}
	groups, err := s.listGroups()
	if err != nil {
		s.sendRequestError(client, requestID, "getHeatingGroups failed: "+err.Error(), "CCU_ERROR")
		return
	}
	s.sendJSON(client, heatingGroupsResponse{Type: "getHeatingGroups_response", RequestID: requestID, Groups: groups})
}

// The group types the HMServer offers: HmIP ones (from the HmIP server) and
// BidCos ones (groupdefinitions.xml)
var heatingGroupTypes = map[string]bool{"hmip.heating.group": true, "HomeMatic.heating": true}

type heatingGroupMembersResponse struct {
	Type      string                 `json:"type"`
	RequestID string                 `json:"requestId,omitempty"`
	Members   backup.SuitableMembers `json:"members"`
}

type heatingGroupSavedResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	Success   bool   `json:"success"`
	ID        int    `json:"id"`
}

// How long the virtual device of a new group may take to appear in ReGa
var groupDeviceWait = 30 * time.Second

// heatingGroupRequest: the fields of the messages handleHeatingGroupChange handles
type heatingGroupRequest struct {
	RequestID string `json:"requestId"`
	GroupType string `json:"groupType"`
	Group     struct {
		ID                    int      `json:"id"`
		Name                  string   `json:"name"`
		Type                  string   `json:"type"`
		ForbidSingleOperation bool     `json:"forbidSingleOperation"`
		Members               []string `json:"members"`
	} `json:"group"`
	ID       int    `json:"id"`
	Password string `json:"password"`
}

// handleHeatingGroupChange lists the channels a group may contain and
// saves and deletes groups through the HMServer, as the WebUI's
// GroupEditPage.ftl and GroupListPage.ftl; changes elevated, with audit
// log. The HMServer needs a WebUI session: the password once, then the
// session is kept until it expires (PASSWORD_REQUIRED).
func (s *Server) handleHeatingGroupChange(client *Client, msgType string, message []byte) {
	var msg heatingGroupRequest
	if !s.decode(client, message, &msg) {
		return
	}
	if client.level != auth.LevelAdmin {
		s.sendRequestError(client, msg.RequestID, "only administrators may change heating groups", "FORBIDDEN")
		return
	}
	if s.backup == nil && s.groups == nil {
		s.sendRequestError(client, msg.RequestID, "heating groups need the WebUI", "NOT_SUPPORTED")
		return
	}
	switch msgType {
	case "getHeatingGroupMembers":
		s.getHeatingGroupMembers(client, msg)
	case "saveHeatingGroup":
		s.saveHeatingGroup(client, msg)
	case "deleteHeatingGroup":
		s.deleteHeatingGroup(client, msg)
	}
}

func (s *Server) getHeatingGroupMembers(client *Client, msg heatingGroupRequest) {
	if !heatingGroupTypes[msg.GroupType] {
		s.sendRequestError(client, msg.RequestID, "unknown group type", "INVALID_VALUE")
		return
	}
	var members backup.SuitableMembers
	var err error
	if s.groups != nil {
		members, err = s.groups.SuitableMembers(msg.GroupType)
	} else {
		members, err = s.backup.SuitableGroupMembers(msg.GroupType)
	}
	if err != nil {
		s.sendRequestError(client, msg.RequestID, "getHeatingGroupMembers failed: "+err.Error(), "CCU_ERROR")
		return
	}
	s.sendJSON(client, heatingGroupMembersResponse{Type: "getHeatingGroupMembers_response", RequestID: msg.RequestID, Members: members})
}

func (s *Server) saveHeatingGroup(client *Client, msg heatingGroupRequest) {
	g := msg.Group
	g.Name = strings.TrimSpace(g.Name)
	entry := audit.Entry{User: client.user, Action: "saveHeatingGroup", Target: g.Name, Value: g}
	if code, errorMsg := s.groupChangeError(client); code != "" {
		s.recordAudit(entry, code)
		s.sendRequestError(client, msg.RequestID, errorMsg, code)
		return
	}
	if g.Name == "" || len(g.Name) > 100 || strings.ContainsAny(g.Name, "\"\\\r\n\t") || !heatingGroupTypes[g.Type] || g.ID < 0 {
		s.recordAudit(entry, "INVALID_VALUE")
		s.sendRequestError(client, msg.RequestID, "invalid heating group", "INVALID_VALUE")
		return
	}
	existing, _ := s.listGroups()
	var previous *heatinggroups.Group
	for i := range existing {
		if int(existing[i].ID) == g.ID {
			previous = &existing[i]
		}
	}
	if g.ID != 0 && previous == nil {
		s.recordAudit(entry, "NOT_FOUND")
		s.sendRequestError(client, msg.RequestID, "unknown heating group", "NOT_FOUND")
		return
	}
	// The group's virtual device is named "<name> INT000000<id>"; on a
	// new name the device follows (dialogRenameVirtualGroupDeviceTitle)
	deviceName := g.Name
	rename := previous == nil || previous.Name != g.Name
	if previous != nil {
		deviceName = previous.DeviceName
		if rename {
			deviceName = g.Name + " " + groupDeviceAddress(g.ID)
		}
	}
	change := backup.GroupChange{
		ID: g.ID, Name: g.Name, Type: g.Type, ForbidSingleOperation: g.ForbidSingleOperation, Members: g.Members, DeviceName: deviceName,
	}
	var id int
	var err error
	if s.groups != nil {
		id, err = s.groupsFor(client).Save(change)
	} else {
		id, err = s.backup.SaveHeatingGroup(client.user, msg.Password, change)
	}
	if err != nil {
		s.failChange(client, msg.RequestID, entry, err)
		return
	}
	if previous != nil {
		entry.Previous = *previous
	}
	s.recordAudit(entry, rega.SetOK)
	if previous == nil {
		deviceName = g.Name + " " + groupDeviceAddress(id)
	}
	var removed []string
	if previous != nil {
		for _, m := range previous.Members {
			if !slices.Contains(g.Members, m.Address) {
				removed = append(removed, m.Address)
			}
		}
	}
	// occulited names the group's device and marks the members itself
	if s.groups == nil {
		go s.setupGroupDevice(groupDeviceAddress(id), deviceName, rename, previous == nil, g.Members, removed)
	}
	s.sendJSON(client, heatingGroupSavedResponse{Type: "saveHeatingGroup_response", RequestID: msg.RequestID, Success: true, ID: id})
}

func (s *Server) deleteHeatingGroup(client *Client, msg heatingGroupRequest) {
	entry := audit.Entry{User: client.user, Action: "deleteHeatingGroup", Target: strconv.Itoa(msg.ID)}
	if code, errorMsg := s.groupChangeError(client); code != "" {
		s.recordAudit(entry, code)
		s.sendRequestError(client, msg.RequestID, errorMsg, code)
		return
	}
	existing, _ := s.listGroups()
	var previous *heatinggroups.Group
	for i := range existing {
		if int(existing[i].ID) == msg.ID {
			previous = &existing[i]
		}
	}
	if previous == nil {
		s.recordAudit(entry, "NOT_FOUND")
		s.sendRequestError(client, msg.RequestID, "unknown heating group", "NOT_FOUND")
		return
	}
	entry.Target = previous.Name
	entry.Previous = *previous
	if s.groups != nil {
		err := s.groupsFor(client).Delete(msg.ID)
		if err != nil {
			s.failChange(client, msg.RequestID, entry, err)
			return
		}
		s.recordAudit(entry, rega.SetOK)
		s.sendJSON(client, changeResponse{Type: "deleteHeatingGroup_response", RequestID: msg.RequestID, Success: true})
		return
	}
	if err := s.backup.DeleteHeatingGroup(client.user, msg.Password, msg.ID); err != nil {
		s.failChange(client, msg.RequestID, entry, err)
		return
	}
	s.recordAudit(entry, rega.SetOK)
	var members []string
	for _, m := range previous.Members {
		members = append(members, m.Address)
	}
	// The members may be operated alone again (GroupListPage.ftl)
	go func() {
		if _, err := s.regaClient.SetupGroupDevice("NONE", "", false, nil, deviceAddresses(members)); err != nil {
			logger.Error("Failed to update the devices of a deleted heating group:", err)
		}
	}()
	s.sendJSON(client, changeResponse{Type: "deleteHeatingGroup_response", RequestID: msg.RequestID, Success: true})
}

// setupGroupDevice names the group's virtual device and marks the members'
// devices; the device of a new group may take a while to appear in ReGa
func (s *Server) setupGroupDevice(address, name string, rename, wait bool, members, removed []string) {
	deadline := time.Now().Add(groupDeviceWait)
	for {
		result, err := s.regaClient.SetupGroupDevice(address, name, rename, deviceAddresses(members), deviceAddresses(removed))
		if err != nil {
			logger.Error("Failed to set up the device of a heating group:", err)
			return
		}
		if result == rega.SetOK || !wait || time.Now().After(deadline) {
			return
		}
		time.Sleep(time.Second)
	}
}

// groupDeviceAddress is the address of a group's virtual device
// (createVirtualDeviceSerialNumber)
func groupDeviceAddress(id int) string {
	return fmt.Sprintf("INT%07d", id)
}

// deviceAddresses are the devices of channel addresses
func deviceAddresses(channels []string) []string {
	var devices []string
	for _, c := range channels {
		device, _, _ := strings.Cut(c, ":")
		if device != "" && !slices.Contains(devices, device) {
			devices = append(devices, device)
		}
	}
	return devices
}

// groupChangeError: administrators with a recent password; on openccu-lite
// the system's administrators only
func (s *Server) groupChangeError(client *Client) (string, string) {
	if code, message := configureError(client); code != "" {
		return code, message
	}
	return s.systemAdminError(client)
}

// SetGroupSessions gives the heating groups a user changes: with the
// user's session, so the system checks the user's level (openccu-lite)
func (s *Server) SetGroupSessions(forSession func(session string) GroupService) {
	s.groupSessions = forSession
}

// groupsFor are the heating groups as client changes them
func (s *Server) groupsFor(client *Client) GroupService {
	if s.groupSessions != nil && client.gateSession.Value != "" {
		return s.groupSessions(client.gateSession.Value)
	}
	return s.groups
}
