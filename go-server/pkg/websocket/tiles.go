package websocket

import (
	"encoding/json"
	"fmt"

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
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	s.configure(client, msg.RequestID, audit.Entry{Action: "setChannelTile", Target: fmt.Sprintf("channel %d", msg.ID), Value: msg.Tile},
		func() (interface{}, string, error) {
			if s.tiles == nil {
				return nil, "NOT_AVAILABLE", nil
			}
			previous := s.tiles.Tile(msg.ID)
			return previous, rega.SetOK, s.tiles.SetTile(msg.ID, msg.Tile)
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

// applyTiles sets the tile chosen for each channel, if one was
func (s *Server) applyTiles(channels []rega.Channel) {
	if s.tiles == nil {
		return
	}
	for i := range channels {
		channels[i].Tile = s.tiles.Tile(channels[i].ID)
	}
}
