package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"

	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/subscriptions"
	"ccu-addon-mui-server/pkg/types"
)

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second
	
	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second
	
	// Send pings to peer with this period (must be less than pongWait)
	pingPeriod = (pongWait * 9) / 10
)

var upgrader = websocket.Upgrader{
	CheckOrigin: checkOrigin,
}

// checkOrigin rejects cross-site WebSocket connections (a foreign web page
// opening ws://<ccu>/ws/mui from the user's browser). Only hostnames are
// compared: the UI is served through lighttpd (or the Vite dev proxy) on a
// different port than this server. lighttpd rewrites Host to 127.0.0.1 but
// passes the original one in X-Forwarded-Host / X-Host.
func checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		// Non-browser clients don't send Origin and aren't a CSWSH vector.
		return true
	}

	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}
	originHost := u.Hostname()

	for _, h := range []string{r.Host, r.Header.Get("X-Forwarded-Host"), r.Header.Get("X-Host")} {
		// X-Forwarded-Host may hold a comma-separated list; the first entry is the client-facing host.
		h = strings.TrimSpace(strings.Split(h, ",")[0])
		if h != "" && strings.EqualFold(hostname(h), originHost) {
			return true
		}
	}

	logger.Error(fmt.Sprintf("❌ Rejected WebSocket connection from origin %q (host %q)", origin, r.Host))
	return false
}

func hostname(hostport string) string {
	if u, err := url.Parse("//" + hostport); err == nil && u.Hostname() != "" {
		return u.Hostname()
	}
	return hostport
}

var clientIDCounter atomic.Uint64

type Client struct {
	// id identifies this connection in the subscription manager. It is
	// immutable, so it can be read from any goroutine without locking.
	id   string
	conn *websocket.Conn
	send chan []byte

	mu       sync.Mutex
	deviceID string
}

func newClient(conn *websocket.Conn) *Client {
	return &Client{
		id:   strconv.FormatUint(clientIDCounter.Add(1), 10),
		conn: conn,
		send: make(chan []byte, 1024),
	}
}

func (c *Client) DeviceID() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.deviceID
}

func (c *Client) setDeviceID(deviceID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.deviceID = deviceID
}

type Server struct {
	cfg                *config.Config
	regaClient         *rega.Client
	clients            map[*Client]bool
	clientsMu          sync.RWMutex
	subscriptionMgr    *subscriptions.Manager
	httpServer         *http.Server
	register           chan *Client
	unregister         chan *Client
	broadcast          chan []byte
}

func NewServer(cfg *config.Config, regaClient *rega.Client) *Server {
	return &Server{
		cfg:             cfg,
		regaClient:      regaClient,
		clients:         make(map[*Client]bool),
		subscriptionMgr: subscriptions.NewManager(),
		register:        make(chan *Client),
		unregister:      make(chan *Client),
		broadcast:       make(chan []byte, 256),
	}
}

func (s *Server) Start(ctx context.Context) error {
	go s.run(ctx)

	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleWebSocket)

	s.httpServer = &http.Server{
		Addr:    fmt.Sprintf(":%d", s.cfg.WSPort),
		Handler: mux,
	}

	logger.Info(fmt.Sprintf("WebSocket Server running on port %d", s.cfg.WSPort))
	logger.Info(fmt.Sprintf("WebSocket URL: ws://localhost:%d", s.cfg.WSPort))

	if err := s.httpServer.ListenAndServe(); err != http.ErrServerClosed {
		return err
	}
	return nil
}

func (s *Server) Close(ctx context.Context) error {
	if s.httpServer != nil {
		return s.httpServer.Shutdown(ctx)
	}
	return nil
}

func (s *Server) run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case client := <-s.register:
			s.clientsMu.Lock()
			s.clients[client] = true
			s.clientsMu.Unlock()
			logger.Info("🔗 New WebSocket client connected. Total clients:", len(s.clients))
		case client := <-s.unregister:
			s.clientsMu.Lock()
			if _, ok := s.clients[client]; ok {
				delete(s.clients, client)
				close(client.send)
				s.subscriptionMgr.Unsubscribe(client.id)
				logger.Debug("📝 Unsubscribed device", client.DeviceID())
			}
			s.clientsMu.Unlock()
			logger.Info("🔌 WebSocket client disconnected. Remaining clients:", len(s.clients))
		}
	}
}

func (s *Server) BroadcastToClients(event *types.CCUEvent) {
	logger.Debug(fmt.Sprintf("📡 Broadcasting event: %s.%s = %v", 
		event.Event.Channel, event.Event.Datapoint, event.Event.Value))
	
	message, err := json.Marshal(event)
	if err != nil {
		logger.Error("Failed to marshal event:", err)
		return
	}

	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()

	sentCount := 0
	filteredCount := 0
	droppedCount := 0

	logger.Debug(fmt.Sprintf("   Connected clients: %d", len(s.clients)))

	for client := range s.clients {
		if !s.subscriptionMgr.ShouldReceiveEvent(client.id, event) {
			logger.Debug(fmt.Sprintf("   Device %s not subscribed to %s, filtering",
				client.DeviceID(), event.Event.Channel))
			filteredCount++
			continue
		}

		select {
		case client.send <- message:
			sentCount++
			logger.Debug(fmt.Sprintf("   ✅ Sent to device %s", client.DeviceID()))
		default:
			logger.Error(fmt.Sprintf("   ⚠️ Device %s buffer full, dropping message", client.DeviceID()))
			droppedCount++
		}
	}

	logger.Debug(fmt.Sprintf("📊 Broadcast complete: %d sent, %d filtered, %d dropped, %d total", 
		sentCount, filteredCount, droppedCount, len(s.clients)))
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Error("WebSocket upgrade error:", err)
		return
	}

	client := newClient(conn)

	s.register <- client

	go s.writePump(client)
	go s.readPump(client)
}

func (s *Server) readPump(client *Client) {
	defer func() {
		s.unregister <- client
		client.conn.Close()
	}()

	// Set up pong handler
	client.conn.SetReadDeadline(time.Now().Add(pongWait))
	client.conn.SetPongHandler(func(string) error {
		client.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := client.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				logger.Error("WebSocket read error:", err)
			}
			break
		}

		// Update read deadline on every message
		client.conn.SetReadDeadline(time.Now().Add(pongWait))
		s.handleMessage(client, message)
	}
}

func (s *Server) writePump(client *Client) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		client.conn.Close()
	}()

	for {
		select {
		case message, ok := <-client.send:
			client.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Channel was closed
				client.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := client.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				logger.Error("WebSocket write error:", err)
				return
			}
		
		case <-ticker.C:
			// Send ping to keep connection alive
			client.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := client.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				logger.Debug(fmt.Sprintf("Ping failed for device %s: %v", client.DeviceID(), err))
				return
			}
		}
	}
}

func (s *Server) handleMessage(client *Client, message []byte) {
	var baseMsg map[string]interface{}
	if err := json.Unmarshal(message, &baseMsg); err != nil {
		s.sendError(client, "invalid JSON: "+err.Error())
		return
	}

	msgType, ok := baseMsg["type"].(string)
	if !ok {
		s.sendError(client, "missing or invalid 'type' field")
		return
	}

	switch msgType {
	case "subscribe":
		s.handleSubscribe(client, message)
	case "getRooms":
		s.handleGetRooms(client, message)
	case "getTrades":
		s.handleGetTrades(client, message)
	case "getChannels":
		s.handleGetChannels(client, message)
	case "setDatapoint":
		s.handleSetDatapoint(client, message)
	default:
		s.sendError(client, fmt.Sprintf("unknown message type: %s", msgType))
	}
}

func (s *Server) handleSubscribe(client *Client, message []byte) {
	var msg types.SubscribeMessage
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendError(client, "invalid subscribe message: "+err.Error())
		return
	}

	client.setDeviceID(msg.DeviceID)
	s.subscriptionMgr.Subscribe(client.id, msg.Channels)

	stats := s.subscriptionMgr.GetStats()
	logger.Debug(fmt.Sprintf("📝 Device %s subscribed to %d channels", msg.DeviceID, len(msg.Channels)))
	logger.Debug(fmt.Sprintf("   Total: %d connections, %d channels", stats.Subscribers, stats.TotalChannels))
	
	if len(msg.Channels) > 0 {
		preview := msg.Channels
		if len(preview) > 5 {
			preview = preview[:5]
		}
		logger.Debug(fmt.Sprintf("   Channels: %v%s", preview, 
			map[bool]string{true: " ...", false: ""}[len(msg.Channels) > 5]))
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

func (s *Server) handleGetRooms(client *Client, message []byte) {
	var msg struct {
		Type     string `json:"type"`
		DeviceID string `json:"deviceId"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendError(client, "invalid getRooms message: "+err.Error())
		return
	}

	if msg.DeviceID == "" {
		s.sendError(client, "deviceId is required")
		return
	}

	result, err := s.regaClient.GetRooms(msg.DeviceID)
	if err != nil {
		s.sendError(client, "getRooms failed: "+err.Error())
		return
	}

	client.send <- []byte(result)
}

func (s *Server) handleGetTrades(client *Client, message []byte) {
	var msg struct {
		Type     string `json:"type"`
		DeviceID string `json:"deviceId"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendError(client, "invalid getTrades message: "+err.Error())
		return
	}

	if msg.DeviceID == "" {
		s.sendError(client, "deviceId is required")
		return
	}

	result, err := s.regaClient.GetTrades(msg.DeviceID)
	if err != nil {
		s.sendError(client, "getTrades failed: "+err.Error())
		return
	}

	client.send <- []byte(result)
}

func (s *Server) handleGetChannels(client *Client, message []byte) {
	var msg struct {
		Type     string `json:"type"`
		DeviceID string `json:"deviceId"`
		RoomID   string `json:"roomId,omitempty"`
		TradeID  string `json:"tradeId,omitempty"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendError(client, "invalid getChannels message: "+err.Error())
		return
	}

	if msg.DeviceID == "" {
		s.sendError(client, "deviceId is required")
		return
	}

	var result string
	var err error

	if msg.RoomID != "" {
		result, err = s.regaClient.GetChannelsForRoom(msg.RoomID, msg.DeviceID)
	} else if msg.TradeID != "" {
		result, err = s.regaClient.GetChannelsForTrade(msg.TradeID, msg.DeviceID)
	} else {
		s.sendError(client, "either roomId or tradeId is required")
		return
	}

	if err != nil {
		s.sendError(client, "getChannels failed: "+err.Error())
		return
	}

	client.send <- []byte(result)
}

func (s *Server) handleSetDatapoint(client *Client, message []byte) {
	var msg struct {
		Type          string      `json:"type"`
		InterfaceName string      `json:"interfaceName"`
		Address       string      `json:"address"`
		Attribute     string      `json:"attribute"`
		Value         interface{} `json:"value"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendError(client, "invalid setDatapoint message: "+err.Error())
		return
	}

	if msg.InterfaceName == "" || msg.Address == "" || msg.Attribute == "" {
		s.sendError(client, "interfaceName, address, and attribute are required")
		return
	}

	valueStr := fmt.Sprintf("%v", msg.Value)
	
	result, err := s.regaClient.SetDatapoint(msg.InterfaceName, msg.Address, msg.Attribute, valueStr)
	if err != nil {
		s.sendError(client, "setDatapoint failed: "+err.Error())
		return
	}

	client.send <- []byte(result)
}

func (s *Server) sendJSON(client *Client, data interface{}) {
	message, err := json.Marshal(data)
	if err != nil {
		logger.Error("Failed to marshal response:", err)
		return
	}
	client.send <- message
}

func (s *Server) sendError(client *Client, errorMsg string) {
	response := types.ErrorResponse{
		Type:  "error",
		Error: errorMsg,
	}
	s.sendJSON(client, response)
}

func (s *Server) GetClientsCount() int {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()
	return len(s.clients)
}
