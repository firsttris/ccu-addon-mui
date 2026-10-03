package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"

	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/subscriptions"
	"ccu-addon-mui-server/pkg/types"
)

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second

	// Send pings to peer with this period (must be less than pongWait)
	pingPeriod = (pongWait * 9) / 10

	// Maximum size of a message from the client. The largest one is a
	// subscribe with all channel addresses of a room or trade.
	maxMessageSize = 128 << 10
)

var deviceIDRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)

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

	// authenticated is only accessed by the read pump, which handles all
	// messages of this client.
	authenticated bool
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
	cfg             *config.Config
	regaClient      *rega.Client
	clients         map[*Client]bool
	clientsMu       sync.RWMutex
	subscriptionMgr *subscriptions.Manager
	httpServer      *http.Server

	// auth is nil when authentication is disabled (AUTH_MODE=none).
	auth *auth.Authenticator

	// rpc reads device and paramset descriptions over XML-RPC; nil if not
	// configured.
	rpc DeviceRPC
}

// DeviceRPC is the part of ccurpc.Client the server uses.
type DeviceRPC interface {
	GetParamsetDescription(iface, address, paramsetKey string) (ccurpc.ParamsetDescription, error)
	GetParamset(iface, address, paramsetKey string) (map[string]interface{}, error)
}

func NewServer(cfg *config.Config, regaClient *rega.Client) *Server {
	return &Server{
		cfg:             cfg,
		regaClient:      regaClient,
		clients:         make(map[*Client]bool),
		subscriptionMgr: subscriptions.NewManager(),
	}
}

// SetAuthenticator requires clients to log in with a CCU user before they
// can read or control anything.
func (s *Server) SetAuthenticator(a *auth.Authenticator) {
	s.auth = a
}

// SetDeviceRPC enables requests that need XML-RPC (paramsets).
func (s *Server) SetDeviceRPC(rpc DeviceRPC) {
	s.rpc = rpc
}

func (s *Server) Start(ctx context.Context) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleWebSocket)

	s.httpServer = &http.Server{
		Addr:              fmt.Sprintf("%s:%d", s.cfg.WSBindHost, s.cfg.WSPort),
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	logger.Info(fmt.Sprintf("WebSocket Server running on %s", s.httpServer.Addr))

	if err := s.httpServer.ListenAndServe(); err != http.ErrServerClosed {
		return err
	}
	return nil
}

func (s *Server) Close(ctx context.Context) error {
	var err error
	if s.httpServer != nil {
		err = s.httpServer.Shutdown(ctx)
	}

	// Shutdown doesn't track hijacked (upgraded) connections, close them
	// explicitly. The read pumps then remove the clients.
	s.clientsMu.RLock()
	for client := range s.clients {
		client.conn.Close()
	}
	s.clientsMu.RUnlock()

	return err
}

func (s *Server) addClient(client *Client) {
	s.clientsMu.Lock()
	s.clients[client] = true
	count := len(s.clients)
	s.clientsMu.Unlock()

	logger.Info("🔗 New WebSocket client connected. Total clients:", count)
}

func (s *Server) removeClient(client *Client) {
	s.clientsMu.Lock()
	if _, ok := s.clients[client]; ok {
		delete(s.clients, client)
		// Safe: BroadcastToClients only sends while holding the read lock,
		// and handler replies run on the read pump, which calls us last.
		close(client.send)
		s.subscriptionMgr.Unsubscribe(client.id)
		logger.Debug("📝 Unsubscribed device", client.DeviceID())
	}
	count := len(s.clients)
	s.clientsMu.Unlock()

	logger.Info("🔌 WebSocket client disconnected. Remaining clients:", count)
}

func (s *Server) BroadcastToClients(event *types.CCUEvent) {
	logger.Debugf("📡 Broadcasting event: %s.%s = %v",
		event.Event.Channel, event.Event.Datapoint, event.Event.Value)

	message, err := json.Marshal(event)
	if err != nil {
		logger.Error("Failed to marshal event:", err)
		return
	}

	// Checked once: the per-client debug lines below would otherwise lock
	// each client for DeviceID() on every event.
	debug := logger.DebugEnabled()

	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()

	sentCount := 0
	filteredCount := 0
	droppedCount := 0

	for client := range s.clients {
		if !s.subscriptionMgr.ShouldReceiveEvent(client.id, event) {
			filteredCount++
			continue
		}

		select {
		case client.send <- message:
			sentCount++
			if debug {
				logger.Debugf("   ✅ Sent to device %s", client.DeviceID())
			}
		default:
			logger.Error(fmt.Sprintf("   ⚠️ Device %s buffer full, dropping message", client.DeviceID()))
			droppedCount++
		}
	}

	logger.Debugf("📊 Broadcast complete: %d sent, %d filtered, %d dropped, %d total",
		sentCount, filteredCount, droppedCount, len(s.clients))
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Error("WebSocket upgrade error:", err)
		return
	}

	client := newClient(conn)

	s.addClient(client)

	go s.writePump(client)
	go s.readPump(client)
}

func (s *Server) readPump(client *Client) {
	defer func() {
		s.removeClient(client)
		client.conn.Close()
	}()

	client.conn.SetReadLimit(maxMessageSize)

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
				logger.Debugf("Ping failed for device %s: %v", client.DeviceID(), err)
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

	// Every request may carry a requestId, which is echoed in its response
	// (or error) so the client can match them up.
	requestID, _ := baseMsg["requestId"].(string)

	msgType, ok := baseMsg["type"].(string)
	if !ok {
		s.sendRequestError(client, requestID, "missing or invalid 'type' field", "")
		return
	}

	switch msgType {
	case "auth":
		s.handleAuth(client, message)
		return
	case "login":
		s.handleLogin(client, message)
		return
	}

	if s.auth != nil && !client.authenticated {
		s.sendRequestError(client, requestID, "authentication required", "AUTH_REQUIRED")
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
	case "getDeviceProblems":
		s.handleGetDeviceProblems(client, requestID)
	case "getParamsetDescription", "getParamset":
		s.handleParamsetRequest(client, msgType, message)
	default:
		s.sendRequestError(client, requestID, fmt.Sprintf("unknown message type: %s", msgType), "")
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
	// All requests the channels of all devices (getChannels only)
	All bool `json:"all"`
}

// parseRequest parses a request and validates its deviceId, which is echoed
// back in the response.
func (s *Server) parseRequest(client *Client, message []byte) (request, bool) {
	var msg request
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message: "+err.Error(), "")
		return msg, false
	}
	if msg.DeviceID == "" {
		s.sendRequestError(client, msg.RequestID, "deviceId is required", "")
		return msg, false
	}
	if !deviceIDRegex.MatchString(msg.DeviceID) {
		s.sendRequestError(client, msg.RequestID, "invalid deviceId", "")
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
	RequestID string         `json:"requestId,omitempty"`
	DeviceID  string         `json:"deviceId"`
	RoomID    string         `json:"roomId,omitempty"`
	TradeID   string         `json:"tradeId,omitempty"`
	All       bool           `json:"all,omitempty"`
	Channels  []rega.Channel `json:"channels"`
}

func (s *Server) handleGetRooms(client *Client, message []byte) {
	msg, ok := s.parseRequest(client, message)
	if !ok {
		return
	}

	rooms, err := s.regaClient.GetRooms()
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

	trades, err := s.regaClient.GetTrades()
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
		channels, err := s.regaClient.GetAllChannels()
		if err != nil {
			s.sendRequestError(client, msg.RequestID, "getChannels failed: "+err.Error(), "")
			return
		}
		s.sendJSON(client, channelsResponse{RequestID: msg.RequestID, DeviceID: msg.DeviceID, All: true, Channels: channels})
		return
	}

	// Rooms and trades are both ReGa enumerations, read the same way.
	objectID := msg.RoomID
	if objectID == "" {
		objectID = msg.TradeID
	}
	if objectID == "" {
		s.sendRequestError(client, msg.RequestID, "roomId, tradeId or all is required", "")
		return
	}

	channels, err := s.regaClient.GetChannels(objectID)
	if err != nil {
		s.sendRequestError(client, msg.RequestID, "getChannels failed: "+err.Error(), "")
		return
	}

	s.sendJSON(client, channelsResponse{
		RequestID: msg.RequestID,
		DeviceID:  msg.DeviceID,
		RoomID:    msg.RoomID,
		TradeID:   msg.TradeID,
		Channels:  channels,
	})
}

type authResponse struct {
	Type         string `json:"type"`
	Success      bool   `json:"success"`
	AuthRequired bool   `json:"authRequired"`
	User         string `json:"user,omitempty"`
	// Level is the CCU user level ("admin", "user", "guest"), empty if
	// unknown. Not enforced yet.
	Level string `json:"level,omitempty"`
	Token string `json:"token,omitempty"`
	Error string `json:"error,omitempty"`
	Code  string `json:"code,omitempty"`
}

// handleAuth checks a stored token. Every client sends this first after
// connecting; a valid token is renewed, so a device in regular use never
// has to log in again.
func (s *Server) handleAuth(client *Client, message []byte) {
	var msg struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(message, &msg)

	if s.auth == nil {
		client.authenticated = true
		// Without authentication everyone can do everything
		s.sendJSON(client, authResponse{Type: "auth_response", Success: true, Level: auth.LevelAdmin})
		return
	}

	session, token, err := s.auth.Refresh(msg.Token)
	if err != nil {
		client.authenticated = false
		s.sendJSON(client, authResponse{Type: "auth_response", AuthRequired: true, Code: "LOGIN_REQUIRED"})
		return
	}

	client.authenticated = true
	s.sendJSON(client, authResponse{Type: "auth_response", Success: true, AuthRequired: true, User: session.User, Level: session.Level, Token: token})
}

// handleLogin verifies CCU credentials and returns a token for the client
// to store.
func (s *Server) handleLogin(client *Client, message []byte) {
	var msg struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendErrorCode(client, "invalid login message", "INVALID_MESSAGE")
		return
	}

	if s.auth == nil {
		client.authenticated = true
		s.sendJSON(client, authResponse{Type: "auth_response", Success: true, Level: auth.LevelAdmin})
		return
	}

	session, token, err := s.auth.Login(msg.Username, msg.Password)
	if err != nil {
		code := "CCU_UNREACHABLE"
		switch err {
		case auth.ErrInvalidCredentials:
			code = "INVALID_CREDENTIALS"
		case auth.ErrTooManyAttempts:
			code = "TOO_MANY_ATTEMPTS"
		}
		logger.Info(fmt.Sprintf("🔒 Login failed for user %q: %v", msg.Username, err))
		s.sendJSON(client, authResponse{Type: "auth_response", AuthRequired: true, Error: err.Error(), Code: code})
		return
	}

	logger.Info(fmt.Sprintf("🔓 User %q logged in", msg.Username))
	client.authenticated = true
	s.sendJSON(client, authResponse{Type: "auth_response", Success: true, AuthRequired: true, User: session.User, Level: session.Level, Token: token})
}

type setDatapointResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	Success   bool   `json:"success"`
	Error     string `json:"error,omitempty"`
	Code      string `json:"code,omitempty"`
}

func (s *Server) handleSetDatapoint(client *Client, message []byte) {
	var msg struct {
		Type          string      `json:"type"`
		RequestID     string      `json:"requestId"`
		InterfaceName string      `json:"interfaceName"`
		Address       string      `json:"address"`
		Attribute     string      `json:"attribute"`
		Value         interface{} `json:"value"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendError(client, "invalid setDatapoint message: "+err.Error())
		return
	}

	// Every outcome is answered with the requestId, so the client can undo
	// its optimistic update and tell the user.
	fail := func(code, errorMsg string) {
		s.sendJSON(client, setDatapointResponse{
			Type: "setDatapoint_response", RequestID: msg.RequestID, Code: code, Error: errorMsg,
		})
	}

	if msg.InterfaceName == "" || msg.Address == "" || msg.Attribute == "" {
		fail("INVALID_REQUEST", "interfaceName, address, and attribute are required")
		return
	}

	valueStr, err := formatValue(msg.Value)
	if err != nil {
		fail("INVALID_REQUEST", err.Error())
		return
	}

	result, err := s.regaClient.SetDatapoint(msg.InterfaceName, msg.Address, msg.Attribute, valueStr)
	if err != nil {
		fail("CCU_ERROR", "setDatapoint failed: "+err.Error())
		return
	}

	switch result {
	case rega.SetOK:
		s.sendJSON(client, setDatapointResponse{Type: "setDatapoint_response", RequestID: msg.RequestID, Success: true})
	case rega.SetUnreach:
		fail("UNREACH", "device is not reachable")
	default:
		fail("NOT_FOUND", "datapoint not found")
	}
}

type deviceProblemsResponse struct {
	Type      string               `json:"type"`
	Devices   []rega.DeviceProblem `json:"devices"`
	RequestID string               `json:"requestId,omitempty"`
}

func (s *Server) handleGetDeviceProblems(client *Client, requestID string) {
	devices, err := s.regaClient.GetDeviceProblems()
	if err != nil {
		s.sendRequestError(client, requestID, "getDeviceProblems failed: "+err.Error(), "")
		return
	}
	s.sendJSON(client, deviceProblemsResponse{Type: "deviceProblems", Devices: devices, RequestID: requestID})
}

type paramsetRequest struct {
	RequestID     string `json:"requestId"`
	InterfaceName string `json:"interfaceName"`
	Address       string `json:"address"`
	ParamsetKey   string `json:"paramsetKey"`
}

type paramsetDescriptionResponse struct {
	Type        string                     `json:"type"`
	RequestID   string                     `json:"requestId,omitempty"`
	Address     string                     `json:"address"`
	ParamsetKey string                     `json:"paramsetKey"`
	Description ccurpc.ParamsetDescription `json:"description"`
}

type paramsetResponse struct {
	Type        string                 `json:"type"`
	RequestID   string                 `json:"requestId,omitempty"`
	Address     string                 `json:"address"`
	ParamsetKey string                 `json:"paramsetKey"`
	Values      map[string]interface{} `json:"values"`
}

// handleParamsetRequest answers getParamsetDescription and getParamset.
// Both only read; addresses and keys are validated by ccurpc.
func (s *Server) handleParamsetRequest(client *Client, msgType string, message []byte) {
	var msg paramsetRequest
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message: "+err.Error(), "")
		return
	}
	if s.rpc == nil {
		s.sendRequestError(client, msg.RequestID, msgType+" is not available", "NOT_AVAILABLE")
		return
	}

	if msgType == "getParamsetDescription" {
		description, err := s.rpc.GetParamsetDescription(msg.InterfaceName, msg.Address, msg.ParamsetKey)
		if err != nil {
			s.sendRequestError(client, msg.RequestID, msgType+" failed: "+err.Error(), "")
			return
		}
		s.sendJSON(client, paramsetDescriptionResponse{
			Type: "paramsetDescription", RequestID: msg.RequestID,
			Address: msg.Address, ParamsetKey: msg.ParamsetKey, Description: description,
		})
		return
	}

	values, err := s.rpc.GetParamset(msg.InterfaceName, msg.Address, msg.ParamsetKey)
	if err != nil {
		s.sendRequestError(client, msg.RequestID, msgType+" failed: "+err.Error(), "")
		return
	}
	s.sendJSON(client, paramsetResponse{
		Type: "paramset", RequestID: msg.RequestID,
		Address: msg.Address, ParamsetKey: msg.ParamsetKey, Values: values,
	})
}

// formatValue converts a JSON value into the string form expected by
// rega.SetDatapoint. fmt's %v would turn large numbers into exponent notation
// (1e+06) and null into "<nil>".
func formatValue(v interface{}) (string, error) {
	switch x := v.(type) {
	case bool:
		return strconv.FormatBool(x), nil
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64), nil
	case string:
		return x, nil
	default:
		return "", fmt.Errorf("value must be a string, number or boolean")
	}
}

// send queues a message without blocking. A full buffer means the write pump
// is gone or the client stopped reading; blocking here would hang the read
// pump, so the client would never be removed.
func (s *Server) send(client *Client, message []byte) {
	select {
	case client.send <- message:
	default:
		logger.Error(fmt.Sprintf("⚠️ Device %s buffer full, dropping response", client.DeviceID()))
	}
}

func (s *Server) sendJSON(client *Client, data interface{}) {
	message, err := json.Marshal(data)
	if err != nil {
		logger.Error("Failed to marshal response:", err)
		return
	}
	s.send(client, message)
}

func (s *Server) sendError(client *Client, errorMsg string) {
	s.sendErrorCode(client, errorMsg, "")
}

func (s *Server) sendErrorCode(client *Client, errorMsg, code string) {
	s.sendRequestError(client, "", errorMsg, code)
}

func (s *Server) sendRequestError(client *Client, requestID, errorMsg, code string) {
	response := types.ErrorResponse{
		Type:      "error",
		Error:     errorMsg,
		Code:      code,
		RequestID: requestID,
	}
	s.sendJSON(client, response)
}
