package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"

	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/subscriptions"
	"ccu-addon-mui-server/pkg/types"
)

// min returns the minimum of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins
	},
}

// Client represents a WebSocket client
type Client struct {
	conn     *websocket.Conn
	send     chan []byte
	deviceID string
}

// Server handles WebSocket connections
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

// NewServer creates a new WebSocket server
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

// Start starts the WebSocket server
func (s *Server) Start(ctx context.Context) error {
	// Start hub
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

// Close gracefully shuts down the WebSocket server
func (s *Server) Close(ctx context.Context) error {
	if s.httpServer != nil {
		return s.httpServer.Shutdown(ctx)
	}
	return nil
}

// run manages client registration, unregistration, and broadcasting
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
				if client.deviceID != "" {
					s.subscriptionMgr.Unsubscribe(client.deviceID)
					logger.Debug("📝 Unsubscribed device", client.deviceID)
				}
			}
			s.clientsMu.Unlock()
			logger.Info("🔌 WebSocket client disconnected. Remaining clients:", len(s.clients))
		}
	}
}

// BroadcastToClients sends a CCU event to all subscribed clients
func (s *Server) BroadcastToClients(event *types.CCUEvent) {
	logger.Info(fmt.Sprintf("📡 Broadcasting event: %s.%s = %v", 
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

	logger.Info(fmt.Sprintf("   Connected clients: %d", len(s.clients)))

	for client := range s.clients {
		if client.deviceID == "" {
			logger.Debug(fmt.Sprintf("   Client has no deviceID, skipping"))
			filteredCount++
			continue
		}
		
		if !s.subscriptionMgr.ShouldReceiveEvent(client.deviceID, event) {
			logger.Debug(fmt.Sprintf("   Device %s not subscribed to %s, filtering", 
				client.deviceID, event.Event.Channel))
			filteredCount++
			continue
		}

		select {
		case client.send <- message:
			sentCount++
			logger.Info(fmt.Sprintf("   ✅ Sent to device %s", client.deviceID))
		default:
			// Client send buffer is full, close connection
			logger.Error(fmt.Sprintf("   ❌ Device %s buffer full, closing", client.deviceID))
			close(client.send)
			delete(s.clients, client)
		}
	}

	logger.Info(fmt.Sprintf("📊 Broadcast complete: %d sent, %d filtered, %d total", 
		sentCount, filteredCount, len(s.clients)))
}

// handleWebSocket handles incoming WebSocket connections
func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Error("WebSocket upgrade error:", err)
		return
	}

	client := &Client{
		conn: conn,
		send: make(chan []byte, 256),
	}

	s.register <- client

	// Start goroutines for reading and writing
	go s.writePump(client)
	go s.readPump(client)
}

// readPump handles incoming messages from a client
func (s *Server) readPump(client *Client) {
	defer func() {
		s.unregister <- client
		client.conn.Close()
	}()

	for {
		_, message, err := client.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				logger.Error("WebSocket read error:", err)
			}
			break
		}

		s.handleMessage(client, message)
	}
}

// writePump sends messages to a client
func (s *Server) writePump(client *Client) {
	defer client.conn.Close()

	for message := range client.send {
		if err := client.conn.WriteMessage(websocket.TextMessage, message); err != nil {
			logger.Error("WebSocket write error:", err)
			return
		}
	}
}

// handleMessage processes incoming messages from clients
func (s *Server) handleMessage(client *Client, message []byte) {
	// Try to parse as JSON
	var baseMsg map[string]interface{}
	if err := json.Unmarshal(message, &baseMsg); err != nil {
		// Not JSON, treat as plain Rega script (Node-RED compatible)
		s.handlePlainScript(client, string(message))
		return
	}

	msgType, ok := baseMsg["type"].(string)
	if !ok {
		s.sendError(client, "missing or invalid 'type' field")
		return
	}

	// Only handle 'subscribe' type - match Node.js behavior
	switch msgType {
	case "subscribe":
		s.handleSubscribe(client, message)
	default:
		// Unknown types are not handled in Node.js version
		// They would fall through to plain script handler
		s.handlePlainScript(client, string(message))
	}
}

// handleSubscribe handles subscription requests
func (s *Server) handleSubscribe(client *Client, message []byte) {
	var msg types.SubscribeMessage
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendError(client, "invalid subscribe message: "+err.Error())
		return
	}

	client.deviceID = msg.DeviceID
	s.subscriptionMgr.Subscribe(msg.DeviceID, msg.Channels)

	stats := s.subscriptionMgr.GetStats()
	logger.Info(fmt.Sprintf("📝 Device %s subscribed to %d channels", msg.DeviceID, len(msg.Channels)))
	logger.Info(fmt.Sprintf("   Total: %d devices, %d channels", stats.Devices, stats.TotalChannels))
	
	// Log first few channels for debugging
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
		Channels:  s.subscriptionMgr.GetSubscriptions(msg.DeviceID),
		RequestID: msg.RequestID,
	}

	s.sendJSON(client, response)
}

// handleScript handles Rega script execution requests
func (s *Server) handleScript(client *Client, message []byte) {
	var msg types.ScriptMessage
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendError(client, "invalid script message: "+err.Error())
		return
	}

	result, err := s.regaClient.Execute(msg.Script)
	if err != nil {
		s.sendError(client, "script execution failed: "+err.Error())
		return
	}

	response := types.ScriptResponse{
		Type:      "script_response",
		Result:    result,
		RequestID: msg.RequestID,
	}

	s.sendJSON(client, response)
}

// handleSetValue handles setValue requests (not implemented in original, but included for completeness)
func (s *Server) handleSetValue(client *Client, message []byte) {
	var msg types.SetValueMessage
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendError(client, "invalid setValue message: "+err.Error())
		return
	}

	// This would need XML-RPC implementation to set values
	s.sendError(client, "setValue not yet implemented")
}

// handlePlainScript handles plain text Rega scripts (Node-RED compatibility)
func (s *Server) handlePlainScript(client *Client, script string) {
	result, err := s.regaClient.Execute(script)
	if err != nil {
		s.sendError(client, "script execution failed: "+err.Error())
		return
	}

	// Send plain result back
	client.send <- []byte(result)
}

// sendJSON sends a JSON response to a client
func (s *Server) sendJSON(client *Client, data interface{}) {
	message, err := json.Marshal(data)
	if err != nil {
		logger.Error("Failed to marshal response:", err)
		return
	}
	client.send <- message
}

// sendError sends an error response to a client
func (s *Server) sendError(client *Client, errorMsg string) {
	response := types.ErrorResponse{
		Type:  "error",
		Error: errorMsg,
	}
	s.sendJSON(client, response)
}

// GetClientsCount returns the number of connected clients
func (s *Server) GetClientsCount() int {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()
	return len(s.clients)
}
