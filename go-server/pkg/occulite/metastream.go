package occulite

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ccu-addon-mui-server/pkg/logger"
)

// MetaEvent is a message of the metadata store's change stream
// (occulited docs/meta-api.md "The change stream")
type MetaEvent struct {
	Revision int64  `json:"revision"`
	Kind     string `json:"kind"`
	Enum     string `json:"enum"`
	Path     string `json:"path"`
	From     string `json:"from"`
	To       string `json:"to"`
}

// MetaEvents follows GET /api/meta/v1/events/sse from the revision since
// (0: from now) until the stream ends, and returns the last revision seen.
// The messages carry data: alone; the server pings every 30 s. connected
// (may be nil) runs once the stream is open, before its first event.
func (c *Client) MetaEvents(ctx context.Context, since int64, connected func(), handle func(MetaEvent)) (int64, error) {
	path := "/api/meta/v1/events/sse"
	if since > 0 {
		path += "?since=" + strconv.FormatInt(since, 10)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+path, nil)
	if err != nil {
		return since, err
	}
	req.Header.Set("Accept", "text/event-stream")
	if token := c.token(); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := (&http.Client{Transport: c.streamTransport()}).Do(req)
	if err != nil {
		return since, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return since, fmt.Errorf("status %d", resp.StatusCode)
	}
	if connected != nil {
		connected()
	}
	// 75 s without a byte (not even the ping) is a dead connection
	alive := make(chan struct{}, 1)
	watchCtx, stop := context.WithCancel(ctx)
	defer stop()
	go func() {
		for {
			select {
			case <-watchCtx.Done():
				return
			case <-alive:
			case <-time.After(75 * time.Second):
				resp.Body.Close()
				return
			}
		}
	}()
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 64*1024), 4<<20)
	var data strings.Builder
	for scanner.Scan() {
		select {
		case alive <- struct{}{}:
		default:
		}
		line := scanner.Text()
		switch {
		case line == "":
			var event MetaEvent
			if data.Len() > 0 && json.Unmarshal([]byte(data.String()), &event) == nil {
				if event.Revision > since {
					since = event.Revision
				}
				handle(event)
			}
			data.Reset()
		case strings.HasPrefix(line, "data:"):
			data.WriteString(strings.TrimPrefix(line[5:], " "))
		}
	}
	return since, scanner.Err()
}

// FollowMeta keeps the add-on's own data in step with openccu-lite's rooms
// and functions: a layout is kept by the node's path, which changes when the
// node is moved (Sebastian in #191). It starts from the revision the add-on
// saw last, so moves while it was stopped still arrive (the server replays
// at least the last 1000 events, meta-api.md). Runs until ctx is done.
func (h *Home) FollowMeta(ctx context.Context) {
	var since int64
	h.store.read(func(data *ownData) { since = data.MetaRevision })
	backoff := time.Second
	for ctx.Err() == nil {
		started := time.Now()
		var err error
		since, err = h.client.MetaEvents(ctx, since, func() { h.metaLive(true) }, h.onMetaEvent)
		// Without the stream nothing says when the snapshot changes
		h.metaLive(false)
		h.keepRevision(since)
		if ctx.Err() != nil {
			return
		}
		if time.Since(started) > time.Minute {
			backoff = time.Second
		}
		logger.Debugf("openccu-lite's change stream ended (%v), again in %s", err, backoff)
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
}

// errUnchanged leaves the add-on's file as it is
var errUnchanged = errors.New("unchanged")

func (h *Home) onMetaEvent(event MetaEvent) {
	// What was below a deleted node is only in the snapshot from before
	before, known := h.lastSnapshot()
	// Every event changes the store, or says it may have changed (resync)
	h.metaChanged()
	switch event.Kind {
	case "resync", "import":
		// resync: the server no longer has the events since our revision;
		// import: a backup replaced the whole store. Either way the moves in
		// between are gone and cannot be replayed. Layouts under old paths
		// stay: a layout is also kept for favorite lists, which are not nodes,
		// and a restored backup brings the old paths back with it
		logger.Info(fmt.Sprintf("openccu-lite's metadata: %s at revision %d, layouts of rooms moved in between stay at the old place", event.Kind, event.Revision))
		h.keepRevision(event.Revision)
	case "node.moved":
		if event.From == event.To {
			return // reordered among its siblings
		}
		snapshot, err := h.snapshot()
		if err != nil {
			logger.Error("Reading openccu-lite's metadata after a move:", err)
			return
		}
		h.changeLayouts(func(layouts map[int64]json.RawMessage) bool {
			return moveLayouts(layouts, snapshot, event.Enum, event.From, event.To)
		})
		h.keepRevision(event.Revision)
	case "node.deleted":
		// occulited deletes the subtree with one event: the layouts of the
		// nodes below go too, as far as the last snapshot read knew them
		paths := []string{event.Path}
		if enum, ok := before.Enums[event.Enum]; known && ok {
			enum.Walk(event.Enum, func(path string, node Node, depth int) {
				if strings.HasPrefix(path, event.Path+"/") {
					paths = append(paths, path)
				}
			})
		}
		h.changeLayouts(func(layouts map[int64]json.RawMessage) bool {
			changed := false
			for _, path := range paths {
				if _, ok := layouts[ID(path)]; ok {
					delete(layouts, ID(path))
					changed = true
				}
			}
			return changed
		})
		h.keepRevision(event.Revision)
	}
}

// changeLayouts changes the tile layouts (mui-tiles.json) before the
// revision is kept: a restart in between replays the event, and a move
// whose layout already went is a no-op
func (h *Home) changeLayouts(fn func(map[int64]json.RawMessage) bool) {
	if h.tiles == nil {
		return
	}
	if err := h.tiles.ChangeLayouts(fn); err != nil {
		logger.Error("Writing the tile layouts:", err)
	}
}

// keepRevision writes the change stream's revision to the add-on's file.
// Only for the events that touch it and when the stream ends: the other
// events would write the file all the time, and replaying them after a
// restart changes nothing
func (h *Home) keepRevision(revision int64) {
	h.changeOwn(func(data *ownData) bool {
		if revision <= data.MetaRevision {
			return false
		}
		data.MetaRevision = revision
		return true
	})
}

// changeOwn writes the add-on's file when fn changed something
func (h *Home) changeOwn(fn func(*ownData) bool) {
	err := h.store.change(func(data *ownData) error {
		if !fn(data) {
			return errUnchanged
		}
		return nil
	})
	if err != nil && !errors.Is(err, errUnchanged) {
		logger.Error("Writing the add-on's data:", err)
	}
}

// moveLayouts gives the layouts of a moved node and of the nodes below it
// their new keys: the node at from is now at to, its children with it
func moveLayouts[V any](layouts map[int64]V, snapshot Snapshot, enumID, from, to string) bool {
	enum, ok := snapshot.Enums[enumID]
	if !ok {
		return false
	}
	changed := false
	enum.Walk(enumID, func(path string, node Node, depth int) {
		if path != to && !strings.HasPrefix(path, to+"/") {
			return
		}
		old := ID(from + strings.TrimPrefix(path, to))
		if layout, ok := layouts[old]; ok {
			delete(layouts, old)
			layouts[ID(path)] = layout
			changed = true
		}
	})
	return changed
}
