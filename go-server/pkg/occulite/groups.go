package occulite

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"ccu-addon-mui-server/pkg/backup"
	"ccu-addon-mui-server/pkg/heatinggroups"
)

// Groups are the heating groups through occulited (/api/system/v1/groups,
// docs/system-api.md "Heating groups"): it is hmipserver's only client of
// the group pages, names the group's device and marks the members
type Groups struct {
	client *Client
}

// NewGroups returns the heating groups behind client
func NewGroups(client *Client) *Groups {
	return &Groups{client: client}
}

// liteMember is a member or candidate of a group. Its id is hmipserver's,
// a device (KEQ9000003) or a channel (00010000000A10:1): the app gets it
// as the member's address and sends it back unchanged (Sebastian in #191,
// docs/system-api.md "Heating groups").
type liteMember struct {
	ID     string `json:"id"`
	Serial string `json:"serial"`
	Type   string `json:"type"`
}

type liteGroup struct {
	ID                    int          `json:"id"`
	Name                  string       `json:"name"`
	Type                  string       `json:"type"`
	TypeLabel             string       `json:"type_label"`
	Device                string       `json:"device"`
	DeviceName            string       `json:"device_name"`
	ForbidSingleOperation bool         `json:"forbid_single_operation"`
	Members               []liteMember `json:"members"`
	Assignable            []liteMember `json:"assignable"`
	Leftover              []liteMember `json:"leftover"`
}

func (g *Groups) call(method, path string, body, out any) error {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	return g.client.do(ctx, method, "/api/system/v1/groups"+path, "", body, out)
}

// List returns the groups with their members
func (g *Groups) List() ([]heatinggroups.Group, error) {
	var list struct {
		Groups []liteGroup `json:"groups"`
	}
	if err := g.call(http.MethodGet, "", nil, &list); err != nil {
		return nil, err
	}
	groups := []heatinggroups.Group{}
	for _, item := range list.Groups {
		var full liteGroup
		if err := g.call(http.MethodGet, fmt.Sprintf("/%d", item.ID), nil, &full); err != nil {
			return nil, err
		}
		group := heatinggroups.Group{
			ID: int64(full.ID), Name: full.Name, Type: full.Type, TypeLabel: item.TypeLabel,
			DeviceAddress: full.Device, DeviceName: full.DeviceName,
			ForbidSingleOperation: full.ForbidSingleOperation, Members: []heatinggroups.Member{},
		}
		for _, m := range full.Members {
			group.Members = append(group.Members, heatinggroups.Member{Address: m.ID, Type: m.Type})
		}
		groups = append(groups, group)
	}
	return groups, nil
}

func members(list []liteMember) []backup.GroupMember {
	out := []backup.GroupMember{}
	for _, m := range list {
		out = append(out, backup.GroupMember{ID: m.ID, Type: m.Type})
	}
	return out
}

// SuitableMembers are the devices a new group of the type could take, and
// those no group fits any more
func (g *Groups) SuitableMembers(groupType string) (backup.SuitableMembers, error) {
	var answer struct {
		Types []struct {
			ID         string       `json:"id"`
			Assignable []liteMember `json:"assignable"`
			Leftover   []liteMember `json:"leftover"`
		} `json:"types"`
	}
	if err := g.call(http.MethodGet, "/types", nil, &answer); err != nil {
		return backup.SuitableMembers{}, err
	}
	for _, t := range answer.Types {
		if t.ID == groupType {
			return backup.SuitableMembers{Assignable: members(t.Assignable), Leftover: members(t.Leftover)}, nil
		}
	}
	return backup.SuitableMembers{Assignable: []backup.GroupMember{}, Leftover: []backup.GroupMember{}}, nil
}

// Save creates or changes a group; the members as a whole
func (g *Groups) Save(change backup.GroupChange) (int, error) {
	body := map[string]any{"name": change.Name, "members": change.Members, "forbid_single_operation": change.ForbidSingleOperation}
	var saved liteGroup
	if change.ID == 0 {
		body["type"] = change.Type
		if err := g.call(http.MethodPost, "", body, &saved); err != nil {
			return 0, err
		}
		return saved.ID, nil
	}
	if err := g.call(http.MethodPut, fmt.Sprintf("/%d", change.ID), body, &saved); err != nil {
		return 0, err
	}
	return change.ID, nil
}

// Delete deletes a group; its members may be operated alone again
func (g *Groups) Delete(id int) error {
	return g.call(http.MethodDelete, fmt.Sprintf("/%d", id), nil, nil)
}

// ForSession are the heating groups changed by a user: with the user's
// session, so the system checks the user's level (system:write)
func (g *Groups) ForSession(session string) *Groups {
	if session == "" {
		return g
	}
	return &Groups{client: g.client.WithBearer(session)}
}
