package websocket

import (
	"encoding/json"
	"fmt"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/rega"
)

// viewIDs are the rooms, trades and favorite lists (of all users): what a
// layout can be stored for
func (s *Server) viewIDs() (map[int64]bool, error) {
	if s.home == nil {
		return nil, fmt.Errorf("the home model is not available")
	}
	rooms, err := s.home.GetRooms()
	if err != nil {
		return nil, err
	}
	trades, err := s.home.GetTrades()
	if err != nil {
		return nil, err
	}
	favorites, err := s.home.GetFavorites("")
	if err != nil {
		return nil, err
	}
	ids := map[int64]bool{}
	for _, v := range append(rooms, trades...) {
		ids[v.ID] = true
	}
	for _, f := range favorites {
		ids[f.ID] = true
	}
	return ids, nil
}

type layoutResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	// JSON, "" if none
	Layout string `json:"layout"`
}

// handleLayout reads or stores the tile layout of a room, trade or favorite
// list in mui-tiles.json, the same for every device. Arranging tiles is
// operating: anyone but a guest.
func (s *Server) handleLayout(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		ID        int64  `json:"id"`
		Layout    string `json:"layout"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if msgType == "getLayout" {
		// Without the store (file unreadable) the tiles show as not arranged
		layout := ""
		if s.tiles != nil {
			layout = s.tiles.Layout(msg.ID)
		}
		s.sendJSON(client, layoutResponse{Type: "getLayout_response", RequestID: msg.RequestID, Layout: layout})
		return
	}
	entry := audit.Entry{User: client.user, Action: msgType, Target: fmt.Sprintf("view %d", msg.ID)}
	finish := func(result string) { s.recordAudit(entry, result) }
	if !canOperate(client.level) {
		finish("FORBIDDEN")
		s.sendRequestError(client, msg.RequestID, "guests may not arrange tiles", "FORBIDDEN")
		return
	}
	if s.tiles == nil {
		finish("NOT_AVAILABLE")
		s.sendRequestError(client, msg.RequestID, "setLayout is not available", "NOT_AVAILABLE")
		return
	}
	// Only rooms, trades and favorite lists; layouts of deleted ones go
	views, err := s.viewIDs()
	if err != nil {
		finish("CCU_ERROR")
		s.sendRequestError(client, msg.RequestID, "setLayout failed: "+err.Error(), "CCU_ERROR")
		return
	}
	if !views[msg.ID] {
		finish(rega.SetNotFound)
		s.sendRequestError(client, msg.RequestID, "setLayout: "+rega.SetNotFound, rega.SetNotFound)
		return
	}
	if err := s.tiles.SetLayout(msg.ID, msg.Layout, func(id int64) bool { return views[id] }); err != nil {
		code := codeOf(err)
		finish(code)
		s.sendRequestError(client, msg.RequestID, "setLayout failed: "+err.Error(), code)
		return
	}
	finish(rega.SetOK)
	s.sendJSON(client, changeResponse{Type: "setLayout_response", RequestID: msg.RequestID, Success: true})
}
