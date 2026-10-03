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

	"ccu-addon-mui-server/pkg/audit"
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

	// authenticated, user and level are only accessed by the read pump,
	// which handles all messages of this client.
	authenticated bool
	user          string
	level         string
	// elevatedUntil: until then the client may change settings (it proved
	// the password recently: admin token). Zero means never; without
	// authentication it is far in the future.
	elevatedUntil time.Time
}

// elevated reports whether the client may change settings now.
func (c *Client) elevated() bool {
	return time.Now().Before(c.elevatedUntil)
}

// alwaysElevated is used when authentication is disabled.
var alwaysElevated = time.Date(9999, 1, 1, 0, 0, 0, 0, time.UTC)

// setSession marks the client as logged in as user with a CCU user level.
func (c *Client) setSession(user, level string) {
	c.authenticated = true
	c.user = user
	c.level = level
	c.elevatedUntil = time.Time{}
}

// canOperate: everyone but guests may switch devices. An unknown level (it
// could not be read) is allowed, as before levels were checked.
func canOperate(level string) bool {
	return level != auth.LevelGuest
}

// configureError says why a client may not change settings, or "" if it
// may: administrators only, and only with a recent password (admin token).
func configureError(c *Client) (code, message string) {
	if c.level != auth.LevelAdmin {
		return "FORBIDDEN", "only administrators may change device settings"
	}
	if !c.elevated() {
		return "ELEVATION_REQUIRED", "enter the password again to change settings"
	}
	return "", ""
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

	// audit records every change; nil disables it
	audit *audit.Log
}

// DeviceRPC is the part of ccurpc.Client the server uses.
type DeviceRPC interface {
	GetParamsetDescription(iface, address, paramsetKey string) (ccurpc.ParamsetDescription, error)
	GetParamset(iface, address, paramsetKey string) (map[string]interface{}, error)
	PutParamset(iface, address, paramsetKey string, values map[string]interface{}) error
	ListDevices(iface string) ([]ccurpc.DeviceDescription, error)
	InterfaceNames() []string
	SetInstallMode(iface string, on bool, seconds int) error
	GetInstallMode(iface string) (int, error)
	DeleteDevice(iface, address string, flags int) error
	Forget(iface, deviceAddress string)
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

// SetAuditLog records every change made through the server.
func (s *Server) SetAuditLog(log *audit.Log) {
	s.audit = log
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
	case "putParamset":
		s.handlePutParamset(client, message)
	case "listDevices":
		s.handleListDevices(client, requestID)
	case "elevate":
		s.handleElevate(client, message)
	case "rename":
		s.handleRename(client, message)
	case "setGroupMember":
		s.handleSetGroupMember(client, message)
	case "setInstallMode", "getInstallMode", "getInbox", "acceptDevice", "deleteDevice":
		s.handlePairing(client, msgType, message)
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
	// unknown.
	Level string `json:"level,omitempty"`
	// AdminToken (administrators, after entering the password) allows
	// changing settings for a few hours; Elevated says whether it is valid.
	AdminToken string `json:"adminToken,omitempty"`
	Elevated   bool   `json:"elevated"`
	Token      string `json:"token,omitempty"`
	Error      string `json:"error,omitempty"`
	Code       string `json:"code,omitempty"`
}

// handleAuth checks a stored token. Every client sends this first after
// connecting; a valid token is renewed, so a device in regular use never
// has to log in again.
func (s *Server) handleAuth(client *Client, message []byte) {
	var msg struct {
		Token      string `json:"token"`
		AdminToken string `json:"adminToken"`
	}
	_ = json.Unmarshal(message, &msg)

	if s.auth == nil {
		// Without authentication everyone can do everything
		client.setSession("", auth.LevelAdmin)
		client.elevatedUntil = alwaysElevated
		s.sendJSON(client, authResponse{Type: "auth_response", Success: true, Level: auth.LevelAdmin, Elevated: true})
		return
	}

	session, token, err := s.auth.Refresh(msg.Token)
	if err != nil {
		client.authenticated = false
		s.sendJSON(client, authResponse{Type: "auth_response", AuthRequired: true, Code: "LOGIN_REQUIRED"})
		return
	}

	client.setSession(session.User, session.Level)
	if msg.AdminToken != "" {
		if expiry, ok := s.auth.VerifyAdmin(msg.AdminToken, session.User); ok {
			client.elevatedUntil = expiry
		}
	}
	s.sendJSON(client, authResponse{
		Type: "auth_response", Success: true, AuthRequired: true, User: session.User, Level: session.Level,
		Token: token, Elevated: client.elevated(),
	})
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
		client.setSession("", auth.LevelAdmin)
		client.elevatedUntil = alwaysElevated
		s.sendJSON(client, authResponse{Type: "auth_response", Success: true, Level: auth.LevelAdmin, Elevated: true})
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
	client.setSession(session.User, session.Level)
	// The password was just entered: administrators may set up right away
	adminToken, err := s.auth.IssueAdminToken(session)
	if err == nil {
		client.elevatedUntil = s.auth.AdminTokenExpiry()
	}
	s.sendJSON(client, authResponse{
		Type: "auth_response", Success: true, AuthRequired: true, User: session.User, Level: session.Level,
		Token: token, AdminToken: adminToken, Elevated: client.elevated(),
	})
}

type elevateResponse struct {
	Type       string `json:"type"`
	RequestID  string `json:"requestId,omitempty"`
	Success    bool   `json:"success"`
	AdminToken string `json:"adminToken,omitempty"`
}

// handleElevate checks the password of the logged-in user again and
// returns an admin token for changing settings.
func (s *Server) handleElevate(client *Client, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		Password  string `json:"password"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_MESSAGE")
		return
	}
	if s.auth == nil {
		client.elevatedUntil = alwaysElevated
		s.sendJSON(client, elevateResponse{Type: "elevate_response", RequestID: msg.RequestID, Success: true})
		return
	}

	adminToken, err := s.auth.Elevate(client.user, msg.Password)
	if err != nil {
		code := "CCU_UNREACHABLE"
		switch err {
		case auth.ErrInvalidCredentials:
			code = "INVALID_CREDENTIALS"
		case auth.ErrTooManyAttempts:
			code = "TOO_MANY_ATTEMPTS"
		case auth.ErrNotAdmin:
			code = "FORBIDDEN"
		}
		logger.Info(fmt.Sprintf("🔒 Elevation failed for user %q: %v", client.user, err))
		s.sendRequestError(client, msg.RequestID, err.Error(), code)
		return
	}
	client.elevatedUntil = s.auth.AdminTokenExpiry()
	s.sendJSON(client, elevateResponse{Type: "elevate_response", RequestID: msg.RequestID, Success: true, AdminToken: adminToken})
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
	// its optimistic update and tell the user, and recorded.
	entry := audit.Entry{
		User:   client.user,
		Action: "setDatapoint",
		Target: msg.InterfaceName + "." + msg.Address + "." + msg.Attribute,
		Value:  msg.Value,
	}
	record := func(result string) {
		entry.Result = result
		if err := s.audit.Record(entry); err != nil {
			logger.Error("Failed to write the audit log:", err)
		}
	}
	fail := func(code, errorMsg string) {
		record(code)
		s.sendJSON(client, setDatapointResponse{
			Type: "setDatapoint_response", RequestID: msg.RequestID, Code: code, Error: errorMsg,
		})
	}

	if !canOperate(client.level) {
		fail("FORBIDDEN", "guests may not control devices")
		return
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

	result, previous, err := s.regaClient.SetDatapoint(msg.InterfaceName, msg.Address, msg.Attribute, valueStr)
	if err != nil {
		fail("CCU_ERROR", "setDatapoint failed: "+err.Error())
		return
	}

	switch result {
	case rega.SetOK:
		entry.Previous = previous
		record(rega.SetOK)
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

// Device is a device (not a channel) as listed for the setup area.
type Device struct {
	InterfaceName string `json:"interfaceName"`
	// Name from ReGa
	Name string `json:"name,omitempty"`
	ccurpc.DeviceDescription
}

type listDevicesResponse struct {
	Type      string   `json:"type"`
	RequestID string   `json:"requestId,omitempty"`
	Devices   []Device `json:"devices"`
}

// handleListDevices lists the devices of all interfaces. An interface that
// doesn't answer (e.g. no VirtualDevices) is left out.
func (s *Server) handleListDevices(client *Client, requestID string) {
	if s.rpc == nil {
		s.sendRequestError(client, requestID, "listDevices is not available", "NOT_AVAILABLE")
		return
	}
	// Names live in ReGa; without them the list still works
	var names map[string]string
	if s.regaClient != nil {
		var err error
		if names, err = s.regaClient.GetDeviceNames(); err != nil {
			logger.Debugf("getDeviceNames: %v", err)
		}
	}
	devices := []Device{}
	for _, iface := range s.rpc.InterfaceNames() {
		list, err := s.rpc.ListDevices(iface)
		if err != nil {
			logger.Debugf("listDevices %s: %v", iface, err)
			continue
		}
		for _, d := range list {
			if d.Parent == "" {
				devices = append(devices, Device{InterfaceName: iface, Name: names[d.Address], DeviceDescription: d})
			}
		}
	}
	s.sendJSON(client, listDevicesResponse{Type: "devices", RequestID: requestID, Devices: devices})
}

type changeResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	Success   bool   `json:"success"`
}

// configure runs a change of the setup area for client: checks that it may
// change settings, runs change and records the outcome. change returns the
// previous value (for the audit log) and a ReGa result.
func (s *Server) configure(client *Client, requestID string, entry audit.Entry, change func() (previous interface{}, result string, err error)) {
	entry.User = client.user
	finish := func(result string) {
		entry.Result = result
		if err := s.audit.Record(entry); err != nil {
			logger.Error("Failed to write the audit log:", err)
		}
	}
	if code, errorMsg := configureError(client); code != "" {
		finish(code)
		s.sendRequestError(client, requestID, errorMsg, code)
		return
	}
	previous, result, err := change()
	if err != nil {
		code := "CCU_ERROR"
		if strings.HasPrefix(err.Error(), "invalid") {
			code = "INVALID_VALUE"
		}
		finish(code)
		s.sendRequestError(client, requestID, entry.Action+" failed: "+err.Error(), code)
		return
	}
	if result != rega.SetOK {
		finish(result)
		s.sendRequestError(client, requestID, entry.Action+": "+result, result)
		return
	}
	entry.Previous = previous
	finish(rega.SetOK)
	s.sendJSON(client, changeResponse{Type: entry.Action + "_response", RequestID: requestID, Success: true})
}

// handleRename renames a device or channel.
func (s *Server) handleRename(client *Client, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		Address   string `json:"address"`
		Name      string `json:"name"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	s.configure(client, msg.RequestID, audit.Entry{Action: "rename", Target: msg.Address, Value: msg.Name},
		func() (interface{}, string, error) {
			result, previous, err := s.regaClient.SetName(msg.Address, msg.Name)
			return previous, result, err
		})
}

// handleSetGroupMember adds a channel to a room or trade, or removes it.
func (s *Server) handleSetGroupMember(client *Client, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		GroupID   int64  `json:"groupId"`
		ChannelID int64  `json:"channelId"`
		Member    bool   `json:"member"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	target := fmt.Sprintf("group %d channel %d", msg.GroupID, msg.ChannelID)
	s.configure(client, msg.RequestID, audit.Entry{Action: "setGroupMember", Target: target, Value: msg.Member},
		func() (interface{}, string, error) {
			result, err := s.regaClient.SetGroupMember(msg.GroupID, msg.ChannelID, msg.Member)
			return !msg.Member, result, err
		})
}

type pairingResponse struct {
	Type      string             `json:"type"`
	RequestID string             `json:"requestId,omitempty"`
	Success   bool               `json:"success"`
	Seconds   *int               `json:"seconds,omitempty"`
	Devices   []rega.InboxDevice `json:"devices,omitempty"`
}

// handlePairing: pairing (install mode), the inbox of new devices and
// deleting devices. All of it is setup, for administrators only.
func (s *Server) handlePairing(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID     string `json:"requestId"`
		InterfaceName string `json:"interfaceName"`
		Address       string `json:"address"`
		On            bool   `json:"on"`
		Seconds       int    `json:"seconds"`
		// deleteDevice: reset the device to factory settings
		Reset bool `json:"reset"`
		// deleteDevice: delete even if it can't be reached
		Force bool `json:"force"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if s.rpc == nil {
		s.sendRequestError(client, msg.RequestID, msgType+" is not available", "NOT_AVAILABLE")
		return
	}

	// Reading is allowed for administrators even without admin token
	switch msgType {
	case "getInstallMode", "getInbox":
		if client.level != auth.LevelAdmin {
			s.sendRequestError(client, msg.RequestID, "only administrators may set up devices", "FORBIDDEN")
			return
		}
		response := pairingResponse{Type: msgType + "_response", RequestID: msg.RequestID, Success: true}
		if msgType == "getInstallMode" {
			seconds, err := s.rpc.GetInstallMode(msg.InterfaceName)
			if err != nil {
				s.sendRequestError(client, msg.RequestID, "getInstallMode failed: "+err.Error(), "CCU_ERROR")
				return
			}
			response.Seconds = &seconds
		} else {
			devices, err := s.regaClient.GetInbox()
			if err != nil {
				s.sendRequestError(client, msg.RequestID, "getInbox failed: "+err.Error(), "CCU_ERROR")
				return
			}
			response.Devices = devices
		}
		s.sendJSON(client, response)
		return
	}

	entry := audit.Entry{Action: msgType, Target: msg.InterfaceName + "." + msg.Address}
	switch msgType {
	case "setInstallMode":
		entry.Target = msg.InterfaceName
		entry.Value = map[string]interface{}{"on": msg.On, "seconds": msg.Seconds}
		s.configure(client, msg.RequestID, entry, func() (interface{}, string, error) {
			return nil, rega.SetOK, s.rpc.SetInstallMode(msg.InterfaceName, msg.On, msg.Seconds)
		})
	case "acceptDevice":
		entry.Target = msg.Address
		s.configure(client, msg.RequestID, entry, func() (interface{}, string, error) {
			result, err := s.regaClient.AcceptDevice(msg.Address)
			return nil, result, err
		})
	case "deleteDevice":
		flags := 0
		if msg.Reset {
			flags |= ccurpc.DeleteReset
		}
		if msg.Force {
			flags |= ccurpc.DeleteForce
		}
		entry.Value = map[string]interface{}{"reset": msg.Reset, "force": msg.Force}
		s.configure(client, msg.RequestID, entry, func() (interface{}, string, error) {
			if err := s.rpc.DeleteDevice(msg.InterfaceName, msg.Address, flags); err != nil {
				return nil, "", err
			}
			s.rpc.Forget(msg.InterfaceName, msg.Address)
			return nil, rega.SetOK, nil
		})
	}
}

type putParamsetResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	Success   bool   `json:"success"`
}

// handlePutParamset changes device settings (MASTER). Administrators only;
// the values are checked against the description and recorded with their
// previous values.
func (s *Server) handlePutParamset(client *Client, message []byte) {
	var msg struct {
		paramsetRequest
		Values map[string]interface{} `json:"values"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message: "+err.Error(), "INVALID_REQUEST")
		return
	}

	entry := audit.Entry{
		User:   client.user,
		Action: "putParamset",
		Target: msg.InterfaceName + "." + msg.Address + "." + msg.ParamsetKey,
		Value:  msg.Values,
	}
	fail := func(code, errorMsg string) {
		entry.Result = code
		if err := s.audit.Record(entry); err != nil {
			logger.Error("Failed to write the audit log:", err)
		}
		s.sendRequestError(client, msg.RequestID, errorMsg, code)
	}

	if code, errorMsg := configureError(client); code != "" {
		fail(code, errorMsg)
		return
	}
	if s.rpc == nil {
		fail("NOT_AVAILABLE", "putParamset is not available")
		return
	}
	// Only settings: VALUES are written one by one with setDatapoint
	if msg.ParamsetKey != ccurpc.ParamsetMaster {
		fail("INVALID_REQUEST", "only the MASTER paramset can be written")
		return
	}

	description, err := s.rpc.GetParamsetDescription(msg.InterfaceName, msg.Address, msg.ParamsetKey)
	if err != nil {
		fail("CCU_ERROR", "putParamset failed: "+err.Error())
		return
	}
	values, err := ccurpc.CoerceValues(description, msg.Values)
	if err != nil {
		fail("INVALID_VALUE", err.Error())
		return
	}

	if current, err := s.rpc.GetParamset(msg.InterfaceName, msg.Address, msg.ParamsetKey); err == nil {
		previous := map[string]interface{}{}
		for name := range values {
			previous[name] = current[name]
		}
		entry.Previous = previous
	}
	entry.Value = values

	if err := s.rpc.PutParamset(msg.InterfaceName, msg.Address, msg.ParamsetKey, values); err != nil {
		fail("CCU_ERROR", "putParamset failed: "+err.Error())
		return
	}
	entry.Result = "OK"
	if err := s.audit.Record(entry); err != nil {
		logger.Error("Failed to write the audit log:", err)
	}
	s.sendJSON(client, putParamsetResponse{Type: "putParamset_response", RequestID: msg.RequestID, Success: true})
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
