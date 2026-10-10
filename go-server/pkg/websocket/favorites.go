package websocket

import (
	"encoding/json"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/rega"
)

type favoritesResponse struct {
	Type      string          `json:"type"`
	RequestID string          `json:"requestId,omitempty"`
	Favorites []rega.Favorite `json:"favorites"`
}

// favoriteActions maps the change messages to favorite_change.tcl actions.
var favoriteActions = map[string]string{
	"createFavorite":     rega.FavoriteCreate,
	"renameFavorite":     rega.FavoriteRename,
	"deleteFavorite":     rega.FavoriteDelete,
	"addFavoriteItem":    rega.FavoriteAdd,
	"removeFavoriteItem": rega.FavoriteRemove,
}

// handleFavorites lists the favorite lists the logged-in CCU user sees and
// changes them. Like the WebUI, users keep their own lists: anyone but a
// guest may change them, but only lists they see.
func (s *Server) handleFavorites(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		ID        int64  `json:"id"`
		ItemID    int64  `json:"itemId"`
		Name      string `json:"name"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	favorites, err := s.home.GetFavorites(client.user)
	if err != nil {
		s.sendRequestError(client, msg.RequestID, "getFavorites failed: "+err.Error(), "CCU_ERROR")
		return
	}
	if msgType == "getFavorites" {
		s.sendJSON(client, favoritesResponse{Type: "getFavorites_response", RequestID: msg.RequestID, Favorites: favorites})
		return
	}

	action := favoriteActions[msgType]
	target := fmt.Sprintf("favorite %d", msg.ID)
	value := msg.Name
	if action == rega.FavoriteAdd || action == rega.FavoriteRemove {
		value = strconv.FormatInt(msg.ItemID, 10)
	}
	entry := audit.Entry{User: client.user, Action: msgType, Target: target, Value: value}
	finish := func(result string) { s.recordAudit(entry, result) }
	if !canOperate(client.level) {
		finish("FORBIDDEN")
		s.sendRequestError(client, msg.RequestID, "guests may not change favorites", "FORBIDDEN")
		return
	}
	if action != rega.FavoriteCreate && !slices.ContainsFunc(favorites, func(f rega.Favorite) bool { return f.ID == msg.ID }) {
		finish(rega.SetNotFound)
		s.sendRequestError(client, msg.RequestID, msgType+": "+rega.SetNotFound, rega.SetNotFound)
		return
	}
	result, previous, err := s.home.ChangeFavorite(rega.FavoriteChange{
		Action: action, ListID: msg.ID, ItemID: msg.ItemID, Name: msg.Name, Username: client.user,
	})
	if err != nil {
		code := "CCU_ERROR"
		if strings.HasPrefix(err.Error(), "invalid") {
			code = "INVALID_VALUE"
		}
		finish(code)
		s.sendRequestError(client, msg.RequestID, msgType+" failed: "+err.Error(), code)
		return
	}
	response := changeResponse{Type: msgType + "_response", RequestID: msg.RequestID, Success: true}
	if action == rega.FavoriteCreate {
		response.ID, _ = strconv.ParseInt(previous, 10, 64)
		entry.Target = fmt.Sprintf("favorite %d", response.ID)
	} else if previous != "" {
		entry.Previous = previous
	}
	finish(result)
	if result != rega.SetOK {
		s.sendRequestError(client, msg.RequestID, msgType+": "+result, result)
		return
	}
	s.sendJSON(client, response)
}
