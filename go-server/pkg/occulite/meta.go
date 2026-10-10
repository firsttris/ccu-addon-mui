package occulite

import (
	"context"
	"net/http"
	"net/url"
	"strings"

	"ccu-addon-mui-server/pkg/home"
)

// Snapshot is the metadata store as GET /api/meta/v1/snapshot answers it
// (occulited docs/meta-format.md)
type Snapshot struct {
	Format   int               `json:"format"`
	Revision int64             `json:"revision"`
	Objects  map[string]Object `json:"objects"`
	Enums    map[string]Enum   `json:"enums"`
}

// Object is a device or a channel, keyed by ref "<interface>.<address>"
type Object struct {
	Name     string         `json:"name"`
	Enums    []string       `json:"enums,omitempty"`
	Meta     map[string]any `json:"meta,omitempty"`
	Orphaned bool           `json:"orphaned,omitempty"`
}

// Enum is a taxonomy: rooms ("room"), functions ("function"), favorites
type Enum struct {
	Name map[string]string `json:"name"`
	Tree []Node            `json:"tree"`
}

// Node is a room, a function or a favorite list; its path is
// <enum>/<id>/<id>…
type Node struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Icon     string `json:"icon,omitempty"`
	Children []Node `json:"children,omitempty"`
}

// Ref is the metadata key of a device or channel
func Ref(iface, address string) string {
	return iface + "." + address
}

// SplitRef splits a ref at its first dot
func SplitRef(ref string) (iface, address string, ok bool) {
	return strings.Cut(ref, ".")
}

// Snapshot reads the whole store
func (c *Client) Snapshot(ctx context.Context) (Snapshot, error) {
	var snapshot Snapshot
	err := c.do(ctx, http.MethodGet, "/api/meta/v1/snapshot", "", nil, &snapshot)
	return snapshot, err
}

// PatchObject changes the name, the enums or a meta namespace of a device
// or channel; it creates the object when it is not there yet (the store
// never invents objects, so a newly paired device has none)
func (c *Client) PatchObject(ctx context.Context, ref string, patch map[string]any) error {
	return c.do(ctx, http.MethodPatch, "/api/meta/v1/objects/"+url.PathEscape(ref), "", patch, nil)
}

// Walk calls fn for every node of the enum with its path, parents first
func (e Enum) Walk(enumID string, fn func(path string, node Node, depth int)) {
	var walk func(prefix string, nodes []Node, depth int)
	walk = func(prefix string, nodes []Node, depth int) {
		for _, node := range nodes {
			path := prefix + "/" + node.ID
			fn(path, node, depth)
			walk(path, node.Children, depth+1)
		}
	}
	walk(enumID, e.Tree, 0)
}

// CreateNode adds a node to an enum (parent "" for a root node)
func (c *Client) CreateNode(ctx context.Context, enum, parent, id, name string) error {
	body := map[string]any{"id": id, "name": name, "parent": nil}
	if parent != "" {
		body["parent"] = parent
	}
	return c.do(ctx, http.MethodPost, "/api/meta/v1/enums/"+url.PathEscape(enum)+"/nodes", "", body, nil)
}

// RenameNode renames the node at path (<enum>/<id>/…)
func (c *Client) RenameNode(ctx context.Context, path, name string) error {
	enum, rest, _ := strings.Cut(path, "/")
	return c.do(ctx, http.MethodPatch, "/api/meta/v1/enums/"+url.PathEscape(enum)+"/nodes/"+rest, "", map[string]string{"name": name}, nil)
}

// DeleteNode deletes the node at path and its subtree; its members lose
// it
func (c *Client) DeleteNode(ctx context.Context, path string) error {
	enum, rest, _ := strings.Cut(path, "/")
	return c.do(ctx, http.MethodDelete, "/api/meta/v1/enums/"+url.PathEscape(enum)+"/nodes/"+rest+"?members=detach", "", nil, nil)
}

// HmIPPairing reads how the system pairs HmIP devices from
// GET /api/meta/v1/version (docs/meta-api.md "Feature detection"); nil
// when the system is older and does not say
func (h *Home) HmIPPairing() (*home.HmIPPairing, error) {
	var answer struct {
		HmIP *struct {
			KeyserverMode  string `json:"keyserver_mode"`
			DeviceKeys     int    `json:"device_keys"`
			OfflinePairing bool   `json:"offline_pairing"`
		} `json:"hmip"`
	}
	ctx, cancel := h.context()
	defer cancel()
	if err := h.client.do(ctx, http.MethodGet, "/api/meta/v1/version", "", nil, &answer); err != nil {
		return nil, err
	}
	if answer.HmIP == nil {
		return nil, nil
	}
	return &home.HmIPPairing{KeyserverMode: answer.HmIP.KeyserverMode, DeviceKeys: answer.HmIP.DeviceKeys, OfflinePairing: answer.HmIP.OfflinePairing}, nil
}
