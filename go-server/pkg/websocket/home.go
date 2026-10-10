package websocket

import (
	"regexp"

	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/types"
)

var deviceIDRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)

func (s *Server) handleSubscribe(client *Client, message []byte) {
	var msg types.SubscribeMessage
	if !s.decode(client, message, &msg) {
		return
	}

	client.setDeviceID(msg.DeviceID)
	s.subscriptionMgr.Subscribe(client.id, msg.Channels)

	stats := s.subscriptionMgr.GetStats()
	logger.Debugf("📝 Device %s subscribed to %d channels", msg.DeviceID, len(msg.Channels))
	logger.Debugf("   Total: %d connections, %d channels", stats.Subscribers, stats.TotalChannels)

	if len(msg.Channels) > 0 {
		preview := msg.Channels
		if len(preview) > 5 {
			preview = preview[:5]
		}
		logger.Debugf("   Channels: %v%s", preview,
			map[bool]string{true: " ...", false: ""}[len(msg.Channels) > 5])
	}

	response := types.SubscribeResponse{
		Type:      "subscribe_response",
		Success:   true,
		DeviceID:  msg.DeviceID,
		Channels:  s.subscriptionMgr.GetSubscriptions(client.id),
		RequestID: msg.RequestID,
	}

	s.sendJSON(client, response)
}

// request is a getRooms, getTrades or getChannels message.
type request struct {
	RequestID string `json:"requestId"`
	DeviceID  string `json:"deviceId"`
	RoomID    string `json:"roomId"`
	TradeID   string `json:"tradeId"`
	// FavoriteID requests the channels of a favorite list (getChannels only)
	FavoriteID string `json:"favoriteId"`
	// All requests the channels of all devices (getChannels only)
	All bool `json:"all"`
}

// parseRequest parses a request and validates its deviceId, which is echoed
// back in the response.
func (s *Server) parseRequest(client *Client, message []byte) (request, bool) {
	var msg request
	if !s.decode(client, message, &msg) {
		return msg, false
	}
	if msg.DeviceID == "" {
		s.sendRequestError(client, msg.RequestID, "deviceId is required", "INVALID_REQUEST")
		return msg, false
	}
	if !deviceIDRegex.MatchString(msg.DeviceID) {
		s.sendRequestError(client, msg.RequestID, "invalid deviceId", "INVALID_REQUEST")
		return msg, false
	}
	return msg, true
}

type roomsResponse struct {
	RequestID string             `json:"requestId,omitempty"`
	DeviceID  string             `json:"deviceId"`
	Rooms     []rega.NamedObject `json:"rooms"`
}

type tradesResponse struct {
	RequestID string             `json:"requestId,omitempty"`
	DeviceID  string             `json:"deviceId"`
	Trades    []rega.NamedObject `json:"trades"`
}

type channelsResponse struct {
	RequestID  string         `json:"requestId,omitempty"`
	DeviceID   string         `json:"deviceId"`
	RoomID     string         `json:"roomId,omitempty"`
	TradeID    string         `json:"tradeId,omitempty"`
	FavoriteID string         `json:"favoriteId,omitempty"`
	All        bool           `json:"all,omitempty"`
	Channels   []rega.Channel `json:"channels"`
}

func (s *Server) handleGetRooms(client *Client, message []byte) {
	msg, ok := s.parseRequest(client, message)
	if !ok {
		return
	}

	rooms, err := s.home.GetRooms()
	if err != nil {
		s.sendRequestError(client, msg.RequestID, "getRooms failed: "+err.Error(), "")
		return
	}

	s.sendJSON(client, roomsResponse{RequestID: msg.RequestID, DeviceID: msg.DeviceID, Rooms: rooms})
}

func (s *Server) handleGetTrades(client *Client, message []byte) {
	msg, ok := s.parseRequest(client, message)
	if !ok {
		return
	}

	trades, err := s.home.GetTrades()
	if err != nil {
		s.sendRequestError(client, msg.RequestID, "getTrades failed: "+err.Error(), "")
		return
	}

	s.sendJSON(client, tradesResponse{RequestID: msg.RequestID, DeviceID: msg.DeviceID, Trades: trades})
}

func (s *Server) handleGetChannels(client *Client, message []byte) {
	msg, ok := s.parseRequest(client, message)
	if !ok {
		return
	}

	if msg.All {
		channels, err := s.home.GetAllChannels()
		if err != nil {
			s.sendRequestError(client, msg.RequestID, "getChannels failed: "+err.Error(), "")
			return
		}
		s.applyTiles(channels)
		s.sendJSON(client, channelsResponse{RequestID: msg.RequestID, DeviceID: msg.DeviceID, All: true, Channels: channels})
		return
	}

	// Rooms, trades and favorite lists are all ReGa enumerations, read
	// the same way.
	objectID := msg.RoomID
	if objectID == "" {
		objectID = msg.TradeID
	}
	if objectID == "" {
		objectID = msg.FavoriteID
	}
	if objectID == "" {
		s.sendRequestError(client, msg.RequestID, "roomId, tradeId, favoriteId or all is required", "")
		return
	}

	channels, err := s.home.GetChannels(objectID)
	if err != nil {
		s.sendRequestError(client, msg.RequestID, "getChannels failed: "+err.Error(), "")
		return
	}
	s.applyTiles(channels)

	s.sendJSON(client, channelsResponse{
		RequestID:  msg.RequestID,
		DeviceID:   msg.DeviceID,
		RoomID:     msg.RoomID,
		TradeID:    msg.TradeID,
		FavoriteID: msg.FavoriteID,
		Channels:   channels,
	})
}
