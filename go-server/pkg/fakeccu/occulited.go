package fakeccu

import (
	"encoding/base32"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
)

// The fake's openccu-lite: occulited's metadata and auth APIs, built from
// the fixture (occulited docs/meta-api.md, docs/system-api.md). The radio
// side, the XML-RPC ports, stays the same as on a CCU.

type liteObject struct {
	Name     string                 `json:"name"`
	Enums    []string               `json:"enums,omitempty"`
	Meta     map[string]interface{} `json:"meta,omitempty"`
	Orphaned bool                   `json:"orphaned,omitempty"`
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

func writeJSON(w http.ResponseWriter, status int, value interface{}) {
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
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"api": "meta", "version": 1, "format": 1, "implementation": "fakeccu",
			"capabilities": map[string]interface{}{"state": true, "history": true, "apis": map[string]int{"meta": 1, "rpc": 1, "system": 1, "auth": 1}},
		})
		return
	case r.URL.Path == "/api/auth/v1/state":
		user, level, sid, ok := c.liteSession(r)
		if !ok {
			writeJSON(w, http.StatusOK, map[string]interface{}{"authenticated": false})
			return
		}
		answer := map[string]interface{}{"authenticated": true, "user": user}
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
		ref, err := url.PathUnescape(strings.TrimPrefix(r.URL.EscapedPath(), "/api/meta/v1/objects/"))
		if err != nil || !strings.Contains(ref, ".") {
			apiError(w, http.StatusBadRequest, "invalid", "bad ref")
			return
		}
		var patch struct {
			Name  *string                `json:"name"`
			Enums *[]string              `json:"enums"`
			Meta  map[string]interface{} `json:"meta"`
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
			sort.Strings(object.Enums)
		}
		for namespace, value := range patch.Meta {
			if object.Meta == nil {
				object.Meta = map[string]interface{}{}
			}
			if value == nil {
				delete(object.Meta, namespace)
			} else {
				object.Meta[namespace] = value
			}
		}
		store.Revision++
		w.Header().Set("ETag", fmt.Sprint(store.Revision))
		writeJSON(w, http.StatusOK, object)
	default:
		apiError(w, http.StatusNotFound, "not_found", r.Method+" "+r.URL.Path)
	}
}

// LiteAddonToken is the fake's add-on token (on openccu-lite
// /run/occulite/addon-tokens/mui.api)
const LiteAddonToken = "olt_fake_addon_token"
