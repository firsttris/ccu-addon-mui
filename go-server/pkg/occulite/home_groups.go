package occulite

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"ccu-addon-mui-server/pkg/home"
)

// The home model of openccu-lite (home.go): rooms and functions

// groupList maps the app's lists to openccu-lite's enums
var groupEnums = map[string]string{"rooms": "room", "funcs": "function"}

func nodes(snapshot Snapshot, enumID string) []home.NamedObject {
	list := []home.NamedObject{}
	if enum, ok := snapshot.Enums[enumID]; ok {
		enum.Walk(enumID, func(path string, node Node, depth int) {
			list = append(list, home.NamedObject{ID: ID(path), Name: node.Name})
		})
	}
	return list
}

// pathOf finds the node path with the app's id
func pathOf(snapshot Snapshot, enumID string, id int64) string {
	found := ""
	if enum, ok := snapshot.Enums[enumID]; ok {
		enum.Walk(enumID, func(path string, node Node, depth int) {
			if ID(path) == id {
				found = path
			}
		})
	}
	return found
}

func (h *Home) GetRooms() ([]home.NamedObject, error) {
	snapshot, err := h.snapshot()
	if err != nil {
		return nil, err
	}
	return nodes(snapshot, "room"), nil
}

func (h *Home) GetTrades() ([]home.NamedObject, error) {
	snapshot, err := h.snapshot()
	if err != nil {
		return nil, err
	}
	return nodes(snapshot, "function"), nil
}

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

// slug makes a node id of a name ([a-z0-9-], ≤ 32), umlauts transcribed
// as occulited's import does
func slug(name string) string {
	replacer := strings.NewReplacer("ä", "ae", "ö", "oe", "ü", "ue", "ß", "ss")
	id := strings.Trim(nonSlug.ReplaceAllString(replacer.Replace(strings.ToLower(name)), "-"), "-")
	if len(id) > 32 {
		id = strings.Trim(id[:32], "-")
	}
	if id == "" {
		id = "raum"
	}
	return id
}

// uniqueSlug is the node id of a name that is not taken yet: "-2", "-3", …
// appended, within the 32 characters of a node id
func uniqueSlug(name string, taken map[string]bool) string {
	base := slug(name)
	id := base
	for n := 2; taken[id]; n++ {
		suffix := fmt.Sprintf("-%d", n)
		id = strings.TrimRight(base[:min(len(base), 32-len(suffix))], "-") + suffix
	}
	return id
}

func (h *Home) CreateGroup(list, name string) (string, int64, error) {
	enumID, ok := groupEnums[list]
	if !ok {
		return home.SetNotFound, 0, nil
	}
	snapshot, err := h.snapshot()
	if err != nil {
		return "", 0, err
	}
	taken := map[string]bool{}
	if enum, ok := snapshot.Enums[enumID]; ok {
		for _, node := range enum.Tree {
			taken[node.ID] = true
		}
	}
	id := uniqueSlug(name, taken)
	ctx, cancel := h.context()
	defer cancel()
	if err := h.client.CreateNode(ctx, enumID, "", id, name); err != nil {
		return "", 0, err
	}
	return home.SetOK, ID(enumID + "/" + id), nil
}

func (h *Home) changeNode(list string, id int64, fn func(ctx context.Context, path string) error) (string, string, error) {
	enumID, ok := groupEnums[list]
	if !ok {
		return home.SetNotFound, "", nil
	}
	snapshot, err := h.snapshot()
	if err != nil {
		return "", "", err
	}
	path := pathOf(snapshot, enumID, id)
	if path == "" {
		return home.SetNotFound, "", nil
	}
	previous := ""
	for _, g := range nodes(snapshot, enumID) {
		if g.ID == id {
			previous = g.Name
		}
	}
	ctx, cancel := h.context()
	defer cancel()
	if err := fn(ctx, path); err != nil {
		return "", "", err
	}
	return home.SetOK, previous, nil
}

func (h *Home) RenameGroup(list string, id int64, name string) (string, string, error) {
	return h.changeNode(list, id, func(ctx context.Context, path string) error { return h.client.RenameNode(ctx, path, name) })
}

func (h *Home) DeleteGroup(list string, id int64) (string, string, error) {
	return h.changeNode(list, id, h.client.DeleteNode)
}

// SetGroupMember puts a channel into a room or function, or takes it out
func (h *Home) SetGroupMember(groupID, channelID int64, member bool) (string, error) {
	snapshot, err := h.snapshot()
	if err != nil {
		return "", err
	}
	path := pathOf(snapshot, "room", groupID)
	if path == "" {
		path = pathOf(snapshot, "function", groupID)
	}
	ch, found := h.channelByID(channelID)
	if path == "" || !found {
		return home.SetNotFound, nil
	}
	ref := Ref(ch.iface, ch.desc.Address)
	object := snapshot.Objects[ref]
	enums := []string{}
	for _, e := range channelEnums(snapshot, ch) {
		if e != path {
			enums = append(enums, e)
		}
	}
	if member {
		enums = append(enums, path)
	}
	patch := map[string]any{"enums": enums}
	if object.Name == "" {
		// The store never invents objects: a new one needs its name
		patch["name"] = defaultName(snapshot, ref, ch.desc.ParentType)
	}
	ctx, cancel := h.context()
	defer cancel()
	if err := h.client.PatchObject(ctx, ref, patch); err != nil {
		return "", err
	}
	return home.SetOK, nil
}
