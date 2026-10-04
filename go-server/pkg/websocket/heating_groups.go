package websocket

import (
	"errors"

	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/heatinggroups"
)

// Where the HMServer keeps the heating groups (CCU.getHeatingGroupList)
var groupsFile = "/etc/config/groups.gson"

// SetGroupsFile sets where groups.gson is (for tests)
func SetGroupsFile(path string) {
	if path != "" {
		groupsFile = path
	}
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
	groups, err := heatinggroups.Read(groupsFile)
	if errors.Is(err, heatinggroups.ErrNoFile) {
		groups, err = []heatinggroups.Group{}, nil
	}
	if err != nil {
		s.sendRequestError(client, requestID, "getHeatingGroups failed: "+err.Error(), "CCU_ERROR")
		return
	}
	s.sendJSON(client, heatingGroupsResponse{Type: "getHeatingGroups_response", RequestID: requestID, Groups: groups})
}
