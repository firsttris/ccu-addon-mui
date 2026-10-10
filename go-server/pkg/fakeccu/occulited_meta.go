package fakeccu

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"
)

// The fake openccu-lite's meta API: objects, enums and their nodes, and
// the change stream (occulited.go routes the requests)

// handleLitePatchObject changes an object's name, enums or meta data, or
// creates it with a name
func (c *CCU) handleLitePatchObject(w http.ResponseWriter, r *http.Request) {
	if user, _, _, ok := c.liteSession(r); ok {
		c.mu.Lock()
		c.calls["meta PATCH "+user]++
		c.mu.Unlock()
	}
	ref, err := url.PathUnescape(strings.TrimPrefix(r.URL.EscapedPath(), "/api/meta/v1/objects/"))
	if err != nil || !strings.Contains(ref, ".") {
		apiError(w, http.StatusBadRequest, "invalid", "bad ref")
		return
	}
	var patch struct {
		Name  *string        `json:"name"`
		Enums *[]string      `json:"enums"`
		Meta  map[string]any `json:"meta"`
	}
	body, _ := io.ReadAll(r.Body)
	if err := json.Unmarshal(body, &patch); err != nil {
		apiError(w, http.StatusBadRequest, "invalid", err.Error())
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	store := c.store()
	object := store.Objects[ref]
	if object == nil {
		if patch.Name == nil || *patch.Name == "" {
			apiError(w, http.StatusBadRequest, "invalid", "a new object needs a name")
			return
		}
		object = &liteObject{}
		store.Objects[ref] = object
	}
	if patch.Name != nil {
		object.Name = *patch.Name
	}
	if patch.Enums != nil {
		object.Enums = append([]string{}, (*patch.Enums)...)
		slices.Sort(object.Enums)
	}
	for namespace, value := range patch.Meta {
		if object.Meta == nil {
			object.Meta = map[string]any{}
		}
		if value == nil {
			delete(object.Meta, namespace)
		} else {
			object.Meta[namespace] = value
		}
	}
	store.Revision++
	c.publishMeta(map[string]any{"kind": "object.updated", "ref": ref, "value": object})
	w.Header().Set("ETag", fmt.Sprint(store.Revision))
	writeJSON(w, http.StatusOK, object)
}

// Rooms and functions: POST /enums/{enum}/nodes, PATCH (rename, move) and
// DELETE (the subtree) /enums/{enum}/nodes/{path}, with their events on the
// change stream as occulited's internal/meta/store.go sends them
func (c *CCU) handleLiteNodes(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/meta/v1/enums/")
	enumID, nodePath, _ := strings.Cut(rest, "/nodes")
	c.mu.Lock()
	defer c.mu.Unlock()
	enum := c.store().Enums[enumID]
	if enum == nil {
		apiError(w, http.StatusNotFound, "not_found", "no enum "+enumID)
		return
	}
	change, ok := liteNodeChanges[r.Method]
	if !ok {
		apiError(w, http.StatusMethodNotAllowed, "method", r.Method)
		return
	}
	var body liteNodeRequest
	_ = json.NewDecoder(r.Body).Decode(&body)
	change(c, w, liteNodeChange{enumID: enumID, enum: enum, path: strings.TrimPrefix(nodePath, "/"), body: body})
}

type liteNodeRequest struct {
	ID     string          `json:"id"`
	Name   string          `json:"name"`
	Parent json.RawMessage `json:"parent"`
}

// parent: absent (false), null (the root, "") or a node's path
func (b liteNodeRequest) parent() (path string, present bool) {
	if len(b.Parent) == 0 {
		return "", false
	}
	_ = json.Unmarshal(b.Parent, &path)
	return path, true
}

// A change of a node: its enum, its path (without the enum) and the request
type liteNodeChange struct {
	enumID string
	enum   *liteEnum
	path   string
	body   liteNodeRequest
}

// liteChildren is the list a node with parentPath ("" the root) keeps its
// children in, nil for an unknown one
func liteChildren(enum *liteEnum, enumID, parentPath string) *[]liteNode {
	if parentPath == "" {
		return &enum.Tree
	}
	siblings, index := findLiteNode(enum, strings.TrimPrefix(parentPath, enumID+"/"))
	if index < 0 {
		return nil
	}
	return &(*siblings)[index].Children
}

// childPath is the path of a node id below parentPath ("" the root)
func childPath(enumID, parentPath, id string) string {
	if parentPath == "" {
		return enumID + "/" + id
	}
	return parentPath + "/" + id
}

var liteNodeChanges = map[string]func(c *CCU, w http.ResponseWriter, n liteNodeChange){
	http.MethodPost:   (*CCU).createLiteNode,
	http.MethodPatch:  (*CCU).updateLiteNode,
	http.MethodDelete: (*CCU).deleteLiteNode,
}

func (c *CCU) createLiteNode(w http.ResponseWriter, n liteNodeChange) {
	parentPath, _ := n.body.parent()
	list := liteChildren(n.enum, n.enumID, parentPath)
	if list == nil {
		apiError(w, 422, "unknown-path", parentPath)
		return
	}
	if slices.ContainsFunc(*list, func(node liteNode) bool { return node.ID == n.body.ID }) {
		apiError(w, http.StatusConflict, "duplicate", n.body.ID)
		return
	}
	*list = append(*list, liteNode{ID: n.body.ID, Name: n.body.Name})
	path := childPath(n.enumID, parentPath, n.body.ID)
	c.store().Revision++
	c.publishMeta(map[string]any{"kind": "node.created", "enum": n.enumID, "path": path})
	writeJSON(w, http.StatusCreated, map[string]string{"path": path})
}

// updateLiteNode renames a node or moves it below another parent
func (c *CCU) updateLiteNode(w http.ResponseWriter, n liteNodeChange) {
	store := c.store()
	siblings, index := findLiteNode(n.enum, n.path)
	if index < 0 {
		apiError(w, 422, "unknown-path", n.path)
		return
	}
	from := n.enumID + "/" + n.path
	if n.body.Name != "" {
		(*siblings)[index].Name = n.body.Name
		store.Revision++
		c.publishMeta(map[string]any{"kind": "node.updated", "enum": n.enumID, "path": from})
	}
	if parentPath, move := n.body.parent(); move {
		if parentPath == from || strings.HasPrefix(parentPath, from+"/") {
			apiError(w, 422, "invalid-move", parentPath)
			return
		}
		node := (*siblings)[index]
		*siblings = append((*siblings)[:index:index], (*siblings)[index+1:]...)
		list := liteChildren(n.enum, n.enumID, parentPath)
		if list == nil {
			apiError(w, 422, "unknown-path", parentPath)
			return
		}
		*list = append(*list, node)
		to := childPath(n.enumID, parentPath, node.ID)
		// The members' paths are rewritten in the same revision
		for _, object := range store.Objects {
			for i, e := range object.Enums {
				if e == from || strings.HasPrefix(e, from+"/") {
					object.Enums[i] = to + strings.TrimPrefix(e, from)
				}
			}
		}
		store.Revision++
		c.publishMeta(map[string]any{"kind": "node.moved", "enum": n.enumID, "from": from, "to": to})
	}
	writeJSON(w, http.StatusOK, map[string]string{"path": n.path})
}

// deleteLiteNode deletes a node with its subtree and takes the objects out
func (c *CCU) deleteLiteNode(w http.ResponseWriter, n liteNodeChange) {
	store := c.store()
	siblings, index := findLiteNode(n.enum, n.path)
	if index < 0 {
		apiError(w, 422, "unknown-path", n.path)
		return
	}
	path := n.enumID + "/" + n.path
	*siblings = append((*siblings)[:index:index], (*siblings)[index+1:]...)
	for _, object := range store.Objects {
		object.Enums = slices.DeleteFunc(object.Enums, func(e string) bool { return e == path || strings.HasPrefix(e, path+"/") })
	}
	store.Revision++
	// One event for the whole subtree
	c.publishMeta(map[string]any{"kind": "node.deleted", "enum": n.enumID, "path": path})
	w.WriteHeader(http.StatusNoContent)
}

// findLiteNode finds the node at path (ids below the enum, "a/b"): the
// slice that holds it and its index, -1 when there is none
func findLiteNode(enum *liteEnum, path string) (*[]liteNode, int) {
	siblings := &enum.Tree
	ids := strings.Split(path, "/")
	for depth, id := range ids {
		index := -1
		for i := range *siblings {
			if (*siblings)[i].ID == id {
				index = i
			}
		}
		if index < 0 {
			return nil, -1
		}
		if depth == len(ids)-1 {
			return siblings, index
		}
		siblings = &(*siblings)[index].Children
	}
	return nil, -1
}

type metaEvent struct {
	revision int64
	data     []byte
}

// publishMeta adds an event to the change stream at the store's revision;
// c.mu is held
func (c *CCU) publishMeta(event map[string]any) {
	event["revision"] = c.store().Revision
	data, _ := json.Marshal(event)
	e := metaEvent{revision: c.store().Revision, data: data}
	c.metaEvents = append(c.metaEvents, e)
	for stream := range c.metaStreams {
		select {
		case stream <- e:
		default:
		}
	}
}

// The metadata change stream (SSE, meta-api.md "The change stream"): data:
// alone, replayed from ?since=
func (c *CCU) handleMetaEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "no streaming", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.WriteHeader(http.StatusOK)
	write := func(e metaEvent) {
		fmt.Fprintf(w, "data: %s\n\n", e.data)
		flusher.Flush()
	}
	fmt.Fprint(w, ": connected\n\n")
	since, _ := strconv.ParseInt(r.URL.Query().Get("since"), 10, 64)
	stream := make(chan metaEvent, 256)
	c.mu.Lock()
	var missed []metaEvent
	for _, e := range c.metaEvents {
		if since > 0 && e.revision > since {
			missed = append(missed, e)
		}
	}
	if c.metaStreams == nil {
		c.metaStreams = map[chan metaEvent]bool{}
	}
	c.metaStreams[stream] = true
	c.mu.Unlock()
	defer func() {
		c.mu.Lock()
		delete(c.metaStreams, stream)
		c.mu.Unlock()
	}()
	for _, e := range missed {
		write(e)
	}
	flusher.Flush()
	for {
		select {
		case <-r.Context().Done():
			return
		case e := <-stream:
			write(e)
		case <-time.After(30 * time.Second):
			fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		}
	}
}
