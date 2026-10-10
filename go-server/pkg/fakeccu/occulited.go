package fakeccu

import (
	"bytes"
	"encoding/base32"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

// The fake's openccu-lite: occulited's metadata and auth APIs, built from
// the fixture (occulited docs/meta-api.md, docs/system-api.md). The radio
// side, the XML-RPC ports, stays the same as on a CCU.

type liteObject struct {
	Name     string         `json:"name"`
	Enums    []string       `json:"enums,omitempty"`
	Meta     map[string]any `json:"meta,omitempty"`
	Orphaned bool           `json:"orphaned,omitempty"`
}

type liteNode struct {
	ID       string     `json:"id"`
	Name     string     `json:"name"`
	Icon     string     `json:"icon,omitempty"`
	Children []liteNode `json:"children,omitempty"`
}

type liteEnum struct {
	Name map[string]string `json:"name"`
	Tree []liteNode        `json:"tree"`
}

type liteStore struct {
	Format   int                    `json:"format"`
	Revision int64                  `json:"revision"`
	Objects  map[string]*liteObject `json:"objects"`
	Enums    map[string]*liteEnum   `json:"enums"`
}

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

// slug turns a room's name into a node id ([a-z0-9-], ≤ 32)
func slug(name string) string {
	replacer := strings.NewReplacer("ä", "ae", "ö", "oe", "ü", "ue", "ß", "ss")
	id := strings.Trim(nonSlug.ReplaceAllString(replacer.Replace(strings.ToLower(name)), "-"), "-")
	if len(id) > 32 {
		id = id[:32]
	}
	if id == "" {
		id = "x"
	}
	return id
}

// LiteSession is the session id the fake's openccu-lite gives a fixture
// user (26 characters of [A-Z2-7], as occulited's)
func LiteSession(user string) string {
	id := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString([]byte(user + "-session-of-the-fake"))
	return (id + strings.Repeat("A", 26))[:26]
}

// liteLevels: ReGa's user levels as openccu-lite's
var liteLevels = map[int]string{8: "administer", 2: "operate", 1: "read"}

// store builds the metadata store from the fixture once; c.mu is held
func (c *CCU) store() *liteStore {
	if c.lite != nil {
		return c.lite
	}
	store := &liteStore{Format: 1, Revision: 1, Objects: map[string]*liteObject{}, Enums: map[string]*liteEnum{}}
	refs := map[int64]string{}
	for _, ch := range c.fixture.Channels {
		ref := ch.Interface + "." + ch.Address
		refs[ch.ID] = ref
		if ch.Name != "" {
			store.Objects[ref] = &liteObject{Name: ch.Name}
		}
	}
	for address, name := range c.fixture.DeviceNames {
		for _, ch := range c.fixture.Channels {
			if strings.HasPrefix(ch.Address, address+":") {
				store.Objects[ch.Interface+"."+address] = &liteObject{Name: name}
				break
			}
		}
	}
	addEnum := func(id, de, en string, groups []Group) {
		enum := &liteEnum{Name: map[string]string{"de": de, "en": en}, Tree: []liteNode{}}
		seen := map[string]bool{}
		for _, group := range groups {
			nodeID := slug(group.Name)
			for seen[nodeID] {
				nodeID += "-2"
			}
			seen[nodeID] = true
			enum.Tree = append(enum.Tree, liteNode{ID: nodeID, Name: group.Name})
			for _, channelID := range group.Channels {
				if object := store.Objects[refs[channelID]]; object != nil {
					object.Enums = append(object.Enums, id+"/"+nodeID)
				}
			}
		}
		store.Enums[id] = enum
	}
	addEnum("room", "Räume", "Rooms", c.fixture.Rooms)
	addEnum("function", "Gewerke", "Functions", c.fixture.Trades)
	c.lite = store
	return store
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func apiError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"error": code, "message": message})
}

// liteSession is who a Bearer value belongs to: a fixture user's session
// or "token:mui", the add-on's own token
func (c *CCU) liteSession(r *http.Request) (user, level, sid string, ok bool) {
	value := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if value == "" {
		return "", "", "", false
	}
	if value == LiteAddonToken {
		return "token:mui", "", "", true
	}
	for _, u := range c.fixture.Users {
		if LiteSession(u.Name) == value {
			return u.Name, liteLevels[u.Level], value, true
		}
	}
	return "", "", "", false
}

func (c *CCU) handleOcculited(w http.ResponseWriter, r *http.Request) {
	c.mu.Lock()
	c.calls["occulited "+r.Method+" "+r.URL.Path]++
	c.mu.Unlock()
	switch {
	case r.URL.Path == "/api/meta/v1/version":
		writeJSON(w, http.StatusOK, map[string]any{
			"api": "meta", "version": 1, "format": 1, "implementation": "fakeccu",
			"capabilities": map[string]any{"state": true, "history": true, "apis": map[string]int{"meta": 1, "rpc": 1, "system": 1, "auth": 1}},
			// The local key mode: new HmIP devices pair with their label only
			"hmip": map[string]any{"keyserver_mode": "LOCAL", "device_keys": 2, "offline_pairing": false},
		})
		return
	case r.URL.Path == "/api/auth/v1/state":
		user, level, sid, ok := c.liteSession(r)
		if !ok {
			writeJSON(w, http.StatusOK, map[string]any{"authenticated": false})
			return
		}
		answer := map[string]any{"authenticated": true, "user": user}
		if sid != "" {
			answer["sid"], answer["level"] = sid, level
			answer["role"] = map[bool]string{true: "admin", false: "user"}[level == "administer"]
		}
		writeJSON(w, http.StatusOK, answer)
		return
	}
	if _, _, _, ok := c.liteSession(r); !ok {
		apiError(w, http.StatusUnauthorized, "unauthenticated", "no credential")
		return
	}
	switch {
	case r.URL.Path == "/api/meta/v1/snapshot" && r.Method == http.MethodGet:
		c.mu.Lock()
		data, _ := json.Marshal(c.store())
		c.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(data)
	case strings.HasPrefix(r.URL.Path, "/api/meta/v1/objects/") && r.Method == http.MethodPatch:
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
	case strings.HasPrefix(r.URL.Path, "/api/rpc/v1/xmlrpc/") && r.Method == http.MethodPost:
		c.handleLiteRPC(w, r)
	case r.URL.Path == "/api/rpc/v1/state" && r.Method == http.MethodGet:
		c.handleLiteState(w)
	case r.URL.Path == "/api/rpc/v1/events" && r.Method == http.MethodGet:
		c.handleLiteEvents(w, r)
	case r.URL.Path == "/api/meta/v1/events/sse" && r.Method == http.MethodGet:
		c.handleMetaEvents(w, r)
	case strings.HasPrefix(r.URL.Path, "/api/meta/v1/enums/"):
		c.handleLiteNodes(w, r)
	case r.URL.Path == "/api/system/v1/service-messages" && r.Method == http.MethodGet:
		c.handleLiteServiceMessages(w)
	case strings.HasPrefix(r.URL.Path, "/api/system/v1/groups"):
		c.handleLiteGroups(w, r)
	default:
		apiError(w, http.StatusNotFound, "not_found", r.Method+" "+r.URL.Path)
	}
}

type liteEvent struct {
	id   int
	kind string
	data []byte
}

// publishLite adds a message to the event stream; c.mu is held
func (c *CCU) publishLite(kind string, data any) {
	encoded, _ := json.Marshal(data)
	event := liteEvent{id: len(c.liteEvents) + 1, kind: kind, data: encoded}
	c.liteEvents = append(c.liteEvents, event)
	for stream := range c.liteStreams {
		select {
		case stream <- event:
		default:
		}
	}
}

// The state store: every value of the fixture's channels
func (c *CCU) handleLiteState(w http.ResponseWriter) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entries := []map[string]any{}
	for _, ch := range c.fixture.Channels {
		for key, value := range ch.Datapoints {
			entries = append(entries, map[string]any{
				"interface": ch.Interface, "address": ch.Address, "datapoint": key, "value": value,
				"lc": c.Started.Format(time.RFC3339), "confirmed": true, "source": "event",
			})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"entries": entries, "total": len(entries), "unconfirmed": 0,
		"event_id": fmt.Sprintf("fake-%d", len(c.liteEvents)),
	})
}

// The event stream (SSE), replayed from Last-Event-ID
func (c *CCU) handleLiteEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "no streaming", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.WriteHeader(http.StatusOK)
	write := func(e liteEvent) {
		// resync is not in the ring: no id, as occulited
		if e.id > 0 {
			fmt.Fprintf(w, "id: fake-%d\n", e.id)
		}
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", e.kind, e.data)
		flusher.Flush()
	}
	fmt.Fprint(w, ": connected\n\n")
	stream := make(chan liteEvent, 256)
	c.mu.Lock()
	last, _ := strconv.Atoi(strings.TrimPrefix(r.Header.Get("Last-Event-ID"), "fake-"))
	missed := append([]liteEvent{}, c.liteEvents[min(last, len(c.liteEvents)):]...)
	if c.liteStreams == nil {
		c.liteStreams = map[chan liteEvent]bool{}
	}
	c.liteStreams[stream] = true
	c.mu.Unlock()
	defer func() {
		c.mu.Lock()
		delete(c.liteStreams, stream)
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
		case <-time.After(15 * time.Second):
			fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		}
	}
}

// Rooms and functions: POST /enums/{enum}/nodes, PATCH (rename, move) and
// DELETE (the subtree) /enums/{enum}/nodes/{path}, with their events on the
// change stream as occulited's internal/meta/store.go sends them
func (c *CCU) handleLiteNodes(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/meta/v1/enums/")
	enumID, nodePath, _ := strings.Cut(rest, "/nodes")
	nodePath = strings.TrimPrefix(nodePath, "/")
	c.mu.Lock()
	defer c.mu.Unlock()
	store := c.store()
	enum := store.Enums[enumID]
	if enum == nil {
		apiError(w, http.StatusNotFound, "not_found", "no enum "+enumID)
		return
	}
	var body struct {
		ID     string          `json:"id"`
		Name   string          `json:"name"`
		Parent json.RawMessage `json:"parent"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	// parent: absent (nil), null (the root) or a node's path
	parent := func() (path string, present bool) {
		if len(body.Parent) == 0 {
			return "", false
		}
		_ = json.Unmarshal(body.Parent, &path)
		return path, true
	}
	children := func(parentPath string) *[]liteNode {
		if parentPath == "" {
			return &enum.Tree
		}
		siblings, index := findLiteNode(enum, strings.TrimPrefix(parentPath, enumID+"/"))
		if index < 0 {
			return nil
		}
		return &(*siblings)[index].Children
	}
	switch r.Method {
	case http.MethodPost:
		parentPath, _ := parent()
		list := children(parentPath)
		if list == nil {
			apiError(w, 422, "unknown-path", parentPath)
			return
		}
		for _, node := range *list {
			if node.ID == body.ID {
				apiError(w, http.StatusConflict, "duplicate", body.ID)
				return
			}
		}
		*list = append(*list, liteNode{ID: body.ID, Name: body.Name})
		path := enumID + "/" + body.ID
		if parentPath != "" {
			path = parentPath + "/" + body.ID
		}
		store.Revision++
		c.publishMeta(map[string]any{"kind": "node.created", "enum": enumID, "path": path})
		writeJSON(w, http.StatusCreated, map[string]string{"path": path})
	case http.MethodPatch:
		siblings, index := findLiteNode(enum, nodePath)
		if index < 0 {
			apiError(w, 422, "unknown-path", nodePath)
			return
		}
		from := enumID + "/" + nodePath
		if body.Name != "" {
			(*siblings)[index].Name = body.Name
			store.Revision++
			c.publishMeta(map[string]any{"kind": "node.updated", "enum": enumID, "path": from})
		}
		if parentPath, move := parent(); move {
			if parentPath == from || strings.HasPrefix(parentPath, from+"/") {
				apiError(w, 422, "invalid-move", parentPath)
				return
			}
			node := (*siblings)[index]
			*siblings = append((*siblings)[:index:index], (*siblings)[index+1:]...)
			list := children(parentPath)
			if list == nil {
				apiError(w, 422, "unknown-path", parentPath)
				return
			}
			*list = append(*list, node)
			to := enumID + "/" + node.ID
			if parentPath != "" {
				to = parentPath + "/" + node.ID
			}
			// The members' paths are rewritten in the same revision
			for _, object := range store.Objects {
				for i, e := range object.Enums {
					if e == from || strings.HasPrefix(e, from+"/") {
						object.Enums[i] = to + strings.TrimPrefix(e, from)
					}
				}
			}
			store.Revision++
			c.publishMeta(map[string]any{"kind": "node.moved", "enum": enumID, "from": from, "to": to})
		}
		writeJSON(w, http.StatusOK, map[string]string{"path": nodePath})
	case http.MethodDelete:
		siblings, index := findLiteNode(enum, nodePath)
		if index < 0 {
			apiError(w, 422, "unknown-path", nodePath)
			return
		}
		path := enumID + "/" + nodePath
		*siblings = append((*siblings)[:index:index], (*siblings)[index+1:]...)
		for _, object := range store.Objects {
			kept := object.Enums[:0]
			for _, e := range object.Enums {
				if e != path && !strings.HasPrefix(e, path+"/") {
					kept = append(kept, e)
				}
			}
			object.Enums = kept
		}
		store.Revision++
		// One event for the whole subtree
		c.publishMeta(map[string]any{"kind": "node.deleted", "enum": enumID, "path": path})
		w.WriteHeader(http.StatusNoContent)
	default:
		apiError(w, http.StatusMethodNotAllowed, "method", r.Method)
	}
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

// LiteResync sends resync on lite-rpc's event stream, as occulited does when
// a client lost events it cannot replay: without an id
func (c *CCU) LiteResync(reason string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	data, _ := json.Marshal(map[string]string{"reason": reason})
	for stream := range c.liteStreams {
		select {
		case stream <- liteEvent{kind: "resync", data: data}:
		default:
		}
	}
}

// LiteAddonToken is the fake's add-on token (on openccu-lite
// /run/occulite/addon-tokens/mui.api)
const LiteAddonToken = "olt_fake_addon_token"

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
	member := func(address string) liteMember {
		serial, _, _ := strings.Cut(address, ":")
		return liteMember{ID: address, Serial: serial, Type: "HEATING_CLIMATECONTROL_TRANSCEIVER"}
	}
	assignable := func() []liteMember {
		taken := map[string]bool{}
		for _, g := range c.liteGroups {
			for _, m := range g.Members {
				taken[m.ID] = true
			}
		}
		list := []liteMember{}
		for _, ch := range c.fixture.Channels {
			if ch.Interface == "HmIP-RF" && ch.Type == "HEATING_CLIMATECONTROL_TRANSCEIVER" && !taken[ch.Address] {
				list = append(list, member(ch.Address))
			}
		}
		return list
	}
	find := func(id string) *liteGroup {
		for _, g := range c.liteGroups {
			if strconv.Itoa(g.ID) == id {
				return g
			}
		}
		return nil
	}
	var body struct {
		Name                  *string  `json:"name"`
		Type                  string   `json:"type"`
		Members               []string `json:"members"`
		ForbidSingleOperation *bool    `json:"forbid_single_operation"`
	}
	if r.Method == http.MethodPost || r.Method == http.MethodPut {
		_ = json.NewDecoder(r.Body).Decode(&body)
	}
	apply := func(g *liteGroup) {
		if body.Name != nil {
			g.Name = *body.Name
			g.DeviceName = g.Name + " " + g.Device
		}
		if body.Members != nil {
			g.Members = []liteMember{}
			for _, address := range body.Members {
				g.Members = append(g.Members, member(address))
			}
		}
		if body.ForbidSingleOperation != nil {
			g.ForbidSingleOperation = *body.ForbidSingleOperation
		}
	}
	switch {
	case rest == "" && r.Method == http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{"groups": c.liteGroups, "devices_to_configure": []liteMember{}})
	case rest == "types" && r.Method == http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{"types": []map[string]any{
			{"id": "hmip.heating.group", "label": "HmIP-Heizungssteuerung", "assignable": assignable(), "leftover": []liteMember{}},
		}})
	case rest == "" && r.Method == http.MethodPost:
		if body.Name == nil || strings.TrimSpace(*body.Name) == "" || body.Type != "hmip.heating.group" {
			apiError(w, 422, "invalid", "name and type")
			return
		}
		c.liteGroupID++
		g := &liteGroup{ID: c.liteGroupID, Type: body.Type, TypeLabel: "HmIP-Heizungssteuerung", Device: fmt.Sprintf("INT%07d", c.liteGroupID)}
		g.Ref = "VirtualDevices." + g.Device
		apply(g)
		c.liteGroups = append(c.liteGroups, g)
		writeJSON(w, http.StatusOK, g)
	case rest != "" && r.Method == http.MethodGet:
		if g := find(rest); g != nil {
			writeJSON(w, http.StatusOK, g)
			return
		}
		apiError(w, http.StatusNotFound, "unknown-group", rest)
	case rest != "" && r.Method == http.MethodPut:
		g := find(rest)
		if g == nil {
			apiError(w, http.StatusNotFound, "unknown-group", rest)
			return
		}
		apply(g)
		writeJSON(w, http.StatusOK, g)
	case rest != "" && r.Method == http.MethodDelete:
		for i, g := range c.liteGroups {
			if strconv.Itoa(g.ID) == rest {
				c.liteGroups = append(c.liteGroups[:i], c.liteGroups[i+1:]...)
				writeJSON(w, http.StatusOK, map[string]any{"deleted": g.ID, "former_members": g.Members})
				return
			}
		}
		apiError(w, http.StatusNotFound, "unknown-group", rest)
	default:
		apiError(w, http.StatusMethodNotAllowed, "method", r.Method)
	}
}

// The service messages occulited collects: the active maintenance
// datapoints of the fixture's channels 0, as the CCU's list has them
func (c *CCU) handleLiteServiceMessages(w http.ResponseWriter) {
	c.mu.Lock()
	defer c.mu.Unlock()
	messages := []map[string]any{}
	for _, m := range c.serviceMessages() {
		device := deviceAddress(m.channel.Address)
		messages = append(messages, map[string]any{
			"interface": m.channel.Interface, "address": device, "channel": m.channel.Address, "key": m.datapoint,
			"value": m.channel.Datapoints[m.datapoint], "since": "2026-01-15T09:00:00Z", "seen": "2026-01-15T09:00:00Z",
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"count": len(messages), "messages": messages, "swept": true, "errors": []string{}})
}

// virtualKeyValues: a virtual key's VALUES (PRESS_SHORT, PRESS_LONG)
var virtualKeyValues = map[string]any{
	"PRESS_SHORT": map[string]any{"TYPE": "ACTION", "OPERATIONS": 6, "FLAGS": 1, "DEFAULT": false},
	"PRESS_LONG":  map[string]any{"TYPE": "ACTION", "OPERATIONS": 6, "FLAGS": 1, "DEFAULT": false},
}

// virtualKeyDevices are the central's HM-RCV-50 and HmIP-RCV-50 with the
// fixture's virtual keys as their channels; c.mu is held
func (c *CCU) virtualKeyDevices(iface string) []map[string]any {
	var devices []map[string]any
	byParent := map[string][]string{}
	for _, ch := range c.fixture.Channels {
		if ch.Interface == iface && isVirtualKey(ch.Address) {
			parent, _, _ := strings.Cut(ch.Address, ":")
			byParent[parent] = append(byParent[parent], ch.Address)
		}
	}
	for parent, children := range byParent {
		kind := "HM-RCV-50"
		if parent == "HmIP-RCV-1" {
			kind = "HmIP-RCV-50"
		}
		devices = append(devices, map[string]any{"ADDRESS": parent, "TYPE": kind, "CHILDREN": children, "PARAMSETS": []any{"MASTER"}, "FLAGS": 1, "VERSION": 1})
		for _, address := range children {
			_, index, _ := strings.Cut(address, ":")
			n, _ := strconv.Atoi(index)
			devices = append(devices, map[string]any{
				"ADDRESS": address, "TYPE": "VIRTUAL_KEY", "PARENT": parent, "PARENT_TYPE": kind,
				"INDEX": n, "FLAGS": 1, "VERSION": 1, "PARAMSETS": []any{"MASTER", "VALUES", "LINK"},
			})
		}
	}
	return devices
}

var liteMethodName = regexp.MustCompile(`<methodName>\s*([^<\s]+)\s*</methodName>`)

// liteRPCTier is the level a lite-rpc call needs (occulited
// docs/lite-rpc-methods.json, abridged): 1 read, 2 operate, 3 configure,
// 4 administer
func liteRPCTier(method string) int {
	switch method {
	case "deleteDevice", "replaceDevice", "installFirmware", "updateFirmware", "changeKey", "changeDevice", "resetDevice", "restoreConfigToDevice":
		return 4
	case "setValue":
		return 2
	}
	for _, prefix := range []string{"get", "list", "ping", "rssiInfo", "system.", "refreshDeployedDeviceFirmwareList"} {
		if strings.HasPrefix(method, prefix) {
			return 1
		}
	}
	return 3
}

var liteLevelRank = map[string]int{"read": 1, "operate": 2, "configure": 3, "administer": 4}

// lite-rpc: POST /api/rpc/v1/xmlrpc/{interface} forwards one XML-RPC call to
// the interface process when the credential's level allows the method; a
// refusal is a fault -1 over 200, as occulited answers it. The add-on's
// token passes every tier here.
func (c *CCU) handleLiteRPC(w http.ResponseWriter, r *http.Request) {
	iface := strings.TrimPrefix(r.URL.Path, "/api/rpc/v1/xmlrpc/")
	if _, ok := c.InterfacePorts[iface]; !ok {
		apiError(w, http.StatusNotFound, "unknown-interface", iface)
		return
	}
	body, _ := io.ReadAll(r.Body)
	method := ""
	if m := liteMethodName.FindSubmatch(body); m != nil {
		method = string(m[1])
	}
	user, level, _, _ := c.liteSession(r)
	c.mu.Lock()
	c.calls["lite-rpc "+iface+" "+method]++
	c.calls["lite-rpc "+user+" "+method]++
	c.mu.Unlock()
	if level != "" && liteLevelRank[level] < liteRPCTier(method) {
		w.Header().Set("Content-Type", "text/xml")
		_, _ = w.Write(toLatin1(encodeFault(-1, method+" needs a higher level than "+level)))
		return
	}
	r.Body = io.NopCloser(bytes.NewReader(body))
	c.handleXMLRPC(iface, w, r)
}
