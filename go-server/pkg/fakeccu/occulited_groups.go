package fakeccu

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// The fake openccu-lite's heating groups (/api/system/v1/groups)

type liteGroup struct {
	ID                    int          `json:"id"`
	Name                  string       `json:"name"`
	Type                  string       `json:"type"`
	TypeLabel             string       `json:"type_label"`
	Device                string       `json:"device"`
	DeviceName            string       `json:"device_name"`
	Ref                   string       `json:"ref"`
	ForbidSingleOperation bool         `json:"forbid_single_operation"`
	Members               []liteMember `json:"members"`
}

type liteMember struct {
	ID     string `json:"id"`
	Serial string `json:"serial"`
	Type   string `json:"type"`
}

// The heating groups of the fake's openccu-lite (system-api.md "Heating
// groups"); the thermostats of the fixture may join them
func (c *CCU) handleLiteGroups(w http.ResponseWriter, r *http.Request) {
	c.mu.Lock()
	defer c.mu.Unlock()
	rest := strings.TrimPrefix(strings.TrimPrefix(r.URL.Path, "/api/system/v1/groups"), "/")
	var body liteGroupRequest
	if r.Method == http.MethodPost || r.Method == http.MethodPut {
		_ = json.NewDecoder(r.Body).Decode(&body)
	}
	// "types" is a page only to read; otherwise it is taken as an id
	page := rest
	if rest != "" && (rest != "types" || r.Method != http.MethodGet) {
		page = "{id}"
	}
	handle, ok := liteGroupPages[page+" "+r.Method]
	if !ok {
		apiError(w, http.StatusMethodNotAllowed, "method", r.Method)
		return
	}
	handle(c, w, rest, body)
}

type liteGroupRequest struct {
	Name                  *string  `json:"name"`
	Type                  string   `json:"type"`
	Members               []string `json:"members"`
	ForbidSingleOperation *bool    `json:"forbid_single_operation"`
}

func liteMemberOf(address string) liteMember {
	serial, _, _ := strings.Cut(address, ":")
	return liteMember{ID: address, Serial: serial, Type: "HEATING_CLIMATECONTROL_TRANSCEIVER"}
}

// applyLiteGroup sets what the request names on g
func applyLiteGroup(g *liteGroup, body liteGroupRequest) {
	if body.Name != nil {
		g.Name = *body.Name
		g.DeviceName = g.Name + " " + g.Device
	}
	if body.Members != nil {
		g.Members = []liteMember{}
		for _, address := range body.Members {
			g.Members = append(g.Members, liteMemberOf(address))
		}
	}
	if body.ForbidSingleOperation != nil {
		g.ForbidSingleOperation = *body.ForbidSingleOperation
	}
}

// The thermostats not in a group yet
func (c *CCU) assignableLiteMembers() []liteMember {
	taken := map[string]bool{}
	for _, g := range c.liteGroups {
		for _, m := range g.Members {
			taken[m.ID] = true
		}
	}
	list := []liteMember{}
	for _, ch := range c.fixture.Channels {
		if ch.Interface == "HmIP-RF" && ch.Type == "HEATING_CLIMATECONTROL_TRANSCEIVER" && !taken[ch.Address] {
			list = append(list, liteMemberOf(ch.Address))
		}
	}
	return list
}

func (c *CCU) liteGroupByID(id string) *liteGroup {
	for _, g := range c.liteGroups {
		if strconv.Itoa(g.ID) == id {
			return g
		}
	}
	return nil
}

// The pages of /api/system/v1/groups by page ("" the list, "types", "{id}"
// a group) and method
var liteGroupPages = map[string]func(c *CCU, w http.ResponseWriter, id string, body liteGroupRequest){
	" GET": func(c *CCU, w http.ResponseWriter, _ string, _ liteGroupRequest) {
		writeJSON(w, http.StatusOK, map[string]any{"groups": c.liteGroups, "devices_to_configure": []liteMember{}})
	},
	"types GET": func(c *CCU, w http.ResponseWriter, _ string, _ liteGroupRequest) {
		writeJSON(w, http.StatusOK, map[string]any{"types": []map[string]any{
			{"id": "hmip.heating.group", "label": "HmIP-Heizungssteuerung", "assignable": c.assignableLiteMembers(), "leftover": []liteMember{}},
		}})
	},
	" POST": func(c *CCU, w http.ResponseWriter, _ string, body liteGroupRequest) {
		if body.Name == nil || strings.TrimSpace(*body.Name) == "" || body.Type != "hmip.heating.group" {
			apiError(w, 422, "invalid", "name and type")
			return
		}
		c.liteGroupID++
		g := &liteGroup{ID: c.liteGroupID, Type: body.Type, TypeLabel: "HmIP-Heizungssteuerung", Device: fmt.Sprintf("INT%07d", c.liteGroupID)}
		g.Ref = "VirtualDevices." + g.Device
		applyLiteGroup(g, body)
		c.liteGroups = append(c.liteGroups, g)
		writeJSON(w, http.StatusOK, g)
	},
	"{id} GET": func(c *CCU, w http.ResponseWriter, id string, _ liteGroupRequest) {
		if g := c.liteGroupByID(id); g != nil {
			writeJSON(w, http.StatusOK, g)
			return
		}
		apiError(w, http.StatusNotFound, "unknown-group", id)
	},
	"{id} PUT": func(c *CCU, w http.ResponseWriter, id string, body liteGroupRequest) {
		g := c.liteGroupByID(id)
		if g == nil {
			apiError(w, http.StatusNotFound, "unknown-group", id)
			return
		}
		applyLiteGroup(g, body)
		writeJSON(w, http.StatusOK, g)
	},
	"{id} DELETE": func(c *CCU, w http.ResponseWriter, id string, _ liteGroupRequest) {
		for i, g := range c.liteGroups {
			if strconv.Itoa(g.ID) == id {
				c.liteGroups = append(c.liteGroups[:i], c.liteGroups[i+1:]...)
				writeJSON(w, http.StatusOK, map[string]any{"deleted": g.ID, "former_members": g.Members})
				return
			}
		}
		apiError(w, http.StatusNotFound, "unknown-group", id)
	},
}
