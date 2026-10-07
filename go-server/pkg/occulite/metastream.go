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
// The messages carry data: alone; the server pings every 30 s.
func (c *Client) MetaEvents(ctx context.Context, since int64, handle func(MetaEvent)) (int64, error) {
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
	resp, err := (&http.Client{Transport: c.HTTP.Transport}).Do(req)
	if err != nil {
		return since, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return since, fmt.Errorf("status %d", resp.StatusCode)
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
// node is moved (Sebastian in #191). Runs until ctx is done.
func (h *Home) FollowMeta(ctx context.Context) {
	since := int64(0)
	backoff := time.Second
	for ctx.Err() == nil {
		started := time.Now()
		var err error
		since, err = h.client.MetaEvents(ctx, since, h.onMetaEvent)
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
	switch event.Kind {
	case "node.moved":
		if event.From == event.To {
			return // reordered among its siblings
		}
		snapshot, err := h.snapshot()
		if err != nil {
			logger.Error("Reading openccu-lite's metadata after a move:", err)
			return
		}
		h.changeOwn(func(data *ownData) bool {
			return moveLayouts(data.Layouts, snapshot, event.Enum, event.From, event.To)
		})
	case "node.deleted":
		h.changeOwn(func(data *ownData) bool {
			if _, ok := data.Layouts[ID(event.Path)]; !ok {
				return false
			}
			delete(data.Layouts, ID(event.Path))
			return true
		})
	}
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
func moveLayouts(layouts map[int64]string, snapshot Snapshot, enumID, from, to string) bool {
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
