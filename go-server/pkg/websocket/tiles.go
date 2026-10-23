package websocket

import (
	"fmt"
	"strings"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/tiles"
)

// handleSetChannelTile stores the tile shown for a channel (light or
// switch, empty for the app's choice) in mui-tiles.json, for every device.
// Setup, for administrators only.
func (s *Server) handleSetChannelTile(client *Client, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		ID        int64  `json:"id"`
		Tile      string `json:"tile"`
	}
	if !s.decode(client, message, &msg) {
		return
	}
	s.configure(client, msg.RequestID, audit.Entry{Action: "setChannelTile", Target: fmt.Sprintf("channel %d", msg.ID), Value: msg.Tile},
		func() (any, string, error) {
			if s.tiles == nil {
				return nil, "NOT_AVAILABLE", nil
			}
			previous := s.tiles.Tile(msg.ID)
			return previous, rega.SetOK, s.tiles.SetTile(msg.ID, msg.Tile)
		})
}

// handleSetChannelNames stores the names channels' tiles show instead of
// the CCU's ("" gives one back), in mui-tiles.json for every device, all
// or none. Given while arranging tiles, so operating: anyone but a guest.
// The CCU's names stay, for its other interfaces.
func (s *Server) handleSetChannelNames(client *Client, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		Names     []struct {
			ID   int64  `json:"id"`
			Name string `json:"name"`
		} `json:"names"`
	}
	if !s.decode(client, message, &msg) {
		return
	}
	changes := make(map[int64]string, len(msg.Names))
	targets := make([]string, 0, len(msg.Names))
	for _, n := range msg.Names {
		changes[n.ID] = n.Name
		targets = append(targets, fmt.Sprintf("channel %d", n.ID))
	}
	entry := audit.Entry{Action: "setChannelNames", Target: strings.Join(targets, ", ")}
	s.operate(client, msg.RequestID, entry, func() (any, string, error) {
		if s.tiles == nil {
			return nil, "NOT_AVAILABLE", nil
		}
		return nil, rega.SetOK, s.tiles.SetNames(changes)
	})
}

// SetTiles enables tile layouts and the tiles chosen for channels
func (s *Server) SetTiles(store *tiles.Store) {
	s.tiles = store
}

// Tiles is the store of tile layouts, nil when it could not be read
func (s *Server) Tiles() *tiles.Store {
	return s.tiles
}

// applyTiles sets the tile chosen and the name given for each channel, if
// they were
func (s *Server) applyTiles(channels []rega.Channel) {
	if s.tiles == nil {
		return
	}
	for i := range channels {
		channels[i].Tile = s.tiles.Tile(channels[i].ID)
		channels[i].DisplayName = s.tiles.Name(channels[i].ID)
	}
}
