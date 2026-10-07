package websocket

import (
	"ccu-addon-mui-server/pkg/addons"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"runtime/debug"
	"slices"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/backup"
	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/diagrams"
	"ccu-addon-mui-server/pkg/home"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/logs"
	"ccu-addon-mui-server/pkg/push"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/rules"
	"ccu-addon-mui-server/pkg/selfupdate"
	"ccu-addon-mui-server/pkg/settings"
	"ccu-addon-mui-server/pkg/subscriptions"
	"ccu-addon-mui-server/pkg/tiles"
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
	// done is closed when the connection is gone. send itself is never
	// closed: handlers that run in their own goroutine (firmware) may
	// still answer after the client disconnected.
	done      chan struct{}
	closeOnce sync.Once
	// reads holds a slot per reading request running beside the read pump
	// (parallelReads)
	reads chan struct{}

	mu       sync.Mutex
	deviceID string
	// sessionID is the logged-in device (auth.SessionInfo) the connection
	// belongs to; read from other goroutines when a device is logged out
	sessionID string
	// sysvars: the connection gets the system variables when they change
	// (sysvars.go)
	sysvars bool
	// alarms, service: the connection gets the alarms or the service
	// messages when they change (messages_watch.go)
	alarms, service bool

	// device describes the browser, from the User-Agent
	device string
	// gateSession is who the platform's login gate let through, when it
	// has one (gate.go)
	gateSession GateSession
	gateOK      bool
	// source is the client's address, for the login lockout
	source string

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

// canOperate: users and administrators may switch devices, guests not. An
// unknown level (ReGa could not tell it at login) is refused too: it might
// be a guest. The level is looked up again on the next connect
// (Authenticator.Refresh).
func canOperate(level string) bool {
	return level == auth.LevelUser || level == auth.LevelAdmin
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
		id:    strconv.FormatUint(clientIDCounter.Add(1), 10),
		conn:  conn,
		send:  make(chan []byte, 1024),
		done:  make(chan struct{}),
		reads: make(chan struct{}, maxParallelReads),
	}
}

// snapshot copies the client for a handler that runs in its own goroutine:
// it reads user, level and elevation from the copy while the read pump may
// change them on the original. Replies still go to the same connection.
func (c *Client) snapshot() *Client {
	c.mu.Lock()
	defer c.mu.Unlock()
	return &Client{
		id: c.id, conn: c.conn, send: c.send, done: c.done,
		deviceID: c.deviceID, sessionID: c.sessionID, sysvars: c.sysvars,
		device: c.device, source: c.source,
		authenticated: c.authenticated, user: c.user, level: c.level, elevatedUntil: c.elevatedUntil,
	}
}

func (c *Client) close() {
	c.closeOnce.Do(func() {
		if c.done != nil {
			close(c.done)
		}
	})
}

// watchSysvars: the connection gets the system variables when they change
// (sysvars.go)
func (c *Client) watchSysvars(on bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sysvars = on
}

func (c *Client) setSessionID(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sessionID = id
}

func (c *Client) SessionID() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.sessionID
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
	// Device firmware updates running, by "<interface> <address>"
	firmwareUpdates sync.Map
	cfg             *config.Config
	// Channels non-administrators may not operate
	readOnly readOnlyChannels
	addons   *addons.Service
	logs     *logs.Service
	// The diagrams and the recorder of their values
	diagrams *diagrams.Store
	recorder *diagrams.Recorder
	// Tile layouts and the tiles chosen for channels (mui-tiles.json)
	tiles *tiles.Store
	// The WebUI's general settings and where the diagram values are
	settings    *settings.Service
	diagramsDir string
	regaClient  *rega.Client
	// The home model: rooms, trades, channels, names, favorites, service
	// messages (the ReGa on a CCU)
	home      home.Source
	clients   map[*Client]bool
	clientsMu sync.RWMutex
	// The system variables last sent to the connections (sysvars.go)
	lastSysvars []byte
	messages    messageWatch
	// The CCU's users, for the automatic login: read at most once a minute,
	// as every connection without a token asks
	autoLoginUsers  cachedList[rega.User]
	sysvarsMu       sync.Mutex
	subscriptionMgr *subscriptions.Manager
	httpServer      *http.Server
	// Push notifications, if enabled
	pushStore *push.Store
	notifier  *push.Notifier
	rules     *rules.Store
	ruleRun   *rules.Engine

	// auth is nil when authentication is disabled (AUTH_MODE=none).
	auth *auth.Authenticator

	// rpc reads device and paramset descriptions over XML-RPC; nil if not
	// configured.
	rpc DeviceRPC
	// Creates CCU backups; nil without a WebUI to create them
	backup *backup.Service
	// Updates this add-on from its GitHub release; nil disables it
	selfUpdate *selfupdate.Updater

	// eQ-3's list of the newest device firmware, kept for a while
	deviceFirmwareCatalog deviceFirmwareCatalog

	// audit records every change; nil disables it
	audit *audit.Log

	// What the add-on runs on (platform.go)
	platform     string
	capabilities Capabilities
	// The platform's login gate, nil to log in here (gate.go)
	gate GateFunc
	// Heating groups kept elsewhere than in the HMServer (heating_groups.go)
	groups GroupService
}

// DeviceRPC is the part of ccurpc.Client the server uses.
type DeviceRPC interface {
	GetParamsetDescription(iface, address, paramsetKey string) (ccurpc.ParamsetDescription, error)
	GetParamset(iface, address, paramsetKey string) (map[string]interface{}, error)
	PutParamset(iface, address, paramsetKey string, values map[string]interface{}) error
	GetDeviceDescription(iface, address string) (ccurpc.DeviceDescription, error)
	SetMetadata(iface, address, dataID string, value interface{}) error
	ListDevices(iface string) ([]ccurpc.DeviceDescription, error)
	InterfaceNames() []string
	SetInstallMode(iface string, on bool, seconds int) error
	GetInstallMode(iface string) (int, error)
	DeleteDevice(iface, address string, flags int) error
	ListReplaceableDevices(iface, newAddress string) ([]ccurpc.DeviceDescription, error)
	ReplaceDevice(iface, oldAddress, newAddress string) error
	Forget(iface, deviceAddress string)
	GetLinks(iface, address string) ([]ccurpc.Link, error)
	GetAllLinks(iface string) ([]ccurpc.Link, error)
	AddLink(iface, sender, receiver, name, description string) error
	RemoveLink(iface, sender, receiver string) error
	GetLinkParamsetDescription(iface, address, partner string) (ccurpc.ParamsetDescription, error)
	GetLinkParamset(iface, address, partner string) (map[string]interface{}, error)
	PutLinkParamset(iface, address, partner string, values map[string]interface{}) error
	ListBidcosInterfaces(iface string) ([]ccurpc.RadioInterface, error)
	SetBidcosInterface(iface, address, module string, roaming bool) error
	SetInstallModeWithWhitelist(iface string, seconds int, sgtin, key string) error
	AddDevice(iface, serial string) error
	SearchDevices(iface string) (int, error)
	KeyMismatchDevice(iface string, reset bool) (string, error)
	SetTempKey(iface, key string) error
	InstallFirmware(iface, address string) error
	RefreshDeployedDeviceFirmwareList(iface string) error
	LogLevel(iface string) (int, error)
	SetLogLevel(iface string, level int) error
}

func NewServer(cfg *config.Config, regaClient *rega.Client) *Server {
	s := &Server{
		cfg:             cfg,
		regaClient:      regaClient,
		clients:         make(map[*Client]bool),
		subscriptionMgr: subscriptions.NewManager(),
		platform:        PlatformCCU,
		capabilities:    CCUCapabilities,
	}
	s.SetRega(regaClient)
	return s
}

// SetHome replaces where the home model comes from (openccu-lite's APIs
// instead of the ReGa)
func (s *Server) SetHome(source home.Source) {
	s.home = source
}

// SetAuthenticator requires clients to log in with a CCU user before they
// can read or control anything.
func (s *Server) SetAuthenticator(a *auth.Authenticator) {
	s.auth = a
	if a != nil {
		a.OnEvict(func(id string) { s.disconnectSession(id, nil) })
	}
}

// SetAuditLog records every change made through the server.
func (s *Server) SetAuditLog(log *audit.Log) {
	s.audit = log
}

// SetBackup enables creating backups; they are downloaded from
// BackupPath/<id>.
func (s *Server) SetBackup(service *backup.Service) {
	s.backup = service
}

// BackupPath is where created backups are downloaded, next to the
// WebSocket (the CCU's lighttpd forwards /ws/mui to the server).
const BackupPath = "/ws/mui/backup/"

// SetPush enables push notifications: subscribing devices and test
// notifications.
// SetAddons enables the add-on list (Zusatzsoftware).
func (s *Server) SetAddons(service *addons.Service) {
	s.addons = service
}

// SetSelfUpdate enables updating this add-on without a reboot.
func (s *Server) SetSelfUpdate(updater *selfupdate.Updater) {
	s.selfUpdate = updater
}

func (s *Server) SetPush(store *push.Store, notifier *push.Notifier) {
	s.pushStore = store
	s.notifier = notifier
}

// SetDeviceRPC enables requests that need XML-RPC (paramsets).
func (s *Server) SetDeviceRPC(rpc DeviceRPC) {
	s.rpc = rpc
}

func (s *Server) Start(ctx context.Context) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleWebSocket)
	// Backups, restores and logs on a CCU (routes_ccu.go)
	s.platformRoutes(mux)
	mux.Handle(DeviceImagePath, s.deviceImageHandler())
	mux.Handle(AssetsPath, s.assetsHandler())

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

	if s.backup != nil {
		s.backup.EndWebUISessions()
	}
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
		client.close()
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
			// Without this event the app would show a stale value for good:
			// close the connection, the app reconnects and reloads everything
			logger.Error(fmt.Sprintf("   ⚠️ Device %s buffer full, dropping message and closing the connection", client.DeviceID()))
			droppedCount++
			client.close()
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
	client.device = deviceLabel(r.UserAgent())
	client.source = clientAddress(r)
	if s.gate != nil {
		session, err := s.gate(r)
		if err != nil && !errors.Is(err, ErrNoSession) {
			logger.Error("Checking the session of the system:", err)
		}
		client.gateSession, client.gateOK = session, err == nil
	}

	s.addClient(client)

	go s.writePump(client)
	go s.readPump(client)
	if client.gateOK {
		go s.watchGate(client, r)
	}
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
		recovered("handling a message", func() { s.handleMessage(client, message) })
		// Pongs aren't read while a slow request (a backup) runs
		client.conn.SetReadDeadline(time.Now().Add(pongWait))
	}
}

// recovered runs f and logs a panic instead of ending the server: the
// add-on runs without a supervisor, a crash would stay down until the next
// restart. The request that panicked gets no answer and times out.
func recovered(what string, f func()) {
	defer func() {
		if r := recover(); r != nil {
			logger.Error(fmt.Sprintf("Panic while %s: %v\n%s", what, r, debug.Stack()))
		}
	}()
	f()
}

func (s *Server) writePump(client *Client) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		client.conn.Close()
	}()

	for {
		select {
		case <-client.done:
			client.conn.SetWriteDeadline(time.Now().Add(writeWait))
			client.conn.WriteMessage(websocket.CloseMessage, []byte{})
			return

		case message := <-client.send:
			client.conn.SetWriteDeadline(time.Now().Add(writeWait))
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

	if (s.auth != nil || s.gate != nil) && !client.authenticated {
		s.sendRequestError(client, requestID, "authentication required", "AUTH_REQUIRED")
		return
	}

	// (Clients built in tests without a reads channel stay sequential.)
	if parallelReads[msgType] && client.reads != nil {
		// Reading requests don't wait for each other: a slow history or
		// link list doesn't hold up switching a light. At most
		// maxParallelReads per connection; the read pump waits for a free
		// slot, so a flood of requests stays bounded.
		// Watches belong to the connection, not to the copy the request
		// runs with
		switch msgType {
		case "getAlarmMessages":
			client.watchMessages(true)
		case "getServiceMessages":
			client.watchMessages(false)
		}
		client.reads <- struct{}{}
		snap := client.snapshot()
		go func() {
			defer func() { <-client.reads }()
			recovered("handling a message", func() { s.dispatch(snap, msgType, requestID, message) })
		}()
		return
	}
	s.dispatch(client, msgType, requestID, message)
}

// parallelReads are the requests that only read: they neither change the
// CCU nor the connection's state (login, elevation, subscriptions, the
// sysvar watch of getSysvars), so they may run beside the others. Everything
// else is handled in order, as sent: the thermostat's "off" sends
// CONTROL_MODE before SET_POINT_TEMPERATURE.
var parallelReads = map[string]bool{
	"getRooms": true, "getTrades": true, "getChannels": true,
	"getDeviceProblems": true, "getDeviceHealth": true, "listDevices": true,
	"getParamsetDescription": true, "getParamset": true,
	"getSystemInfo": true, "getDiagramData": true, "getHeatingGroups": true,
	"getVirtualKeys": true, "getDevicePrograms": true, "getHistory": true,
	"getLinks": true, "getLinkParamsetDescription": true, "getLinkParamset": true, "getAllLinks": true,
	"getDeviceImages": true, "getPrograms": true, "getProgram": true,
	"getServiceMessages": true, "getAlarmMessages": true, "getFavorites": true,
}

const maxParallelReads = 4

func (s *Server) dispatch(client *Client, msgType, requestID string, message []byte) {
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
	case "getDeviceHealth":
		s.handleDeviceHealth(client, requestID)
	case "getParamsetDescription", "getParamset":
		s.handleParamsetRequest(client, msgType, message)
	case "putParamset":
		s.handlePutParamset(client, message)
	case "listDevices":
		s.handleListDevices(client, requestID)
	case "elevate":
		s.handleElevate(client, message)
	case "endElevation":
		s.handleEndElevation(client, message)
	case "rename":
		s.handleRename(client, message)
	case "setChannelTile":
		s.handleSetChannelTile(client, message)
	case "getSystemInfo":
		s.handleSystemInfo(client, requestID)
	case "getGeneralSettings", "setGeneralSettings":
		s.handleGeneralSettings(client, msgType, message)
	case "getDiagrams", "getDiagramData", "saveDiagram", "deleteDiagram":
		s.handleDiagrams(client, msgType, message)
	case "getHeatingGroupMembers", "saveHeatingGroup", "deleteHeatingGroup":
		s.handleHeatingGroupChange(client, msgType, message)
	case "getHeatingGroups":
		s.handleHeatingGroups(client, requestID)
	case "getUserLanguage", "setUserLanguage":
		s.handleUserLanguage(client, msgType, message)
	case "listSessions", "revokeSession", "logout":
		s.handleSessions(client, msgType, message)
	case "getLinks", "addLink", "removeLink", "getLinkParamsetDescription", "getLinkParamset", "putLinkParamset":
		s.handleLinks(client, msgType, message)
	case "getAllLinks":
		s.handleAllLinks(client, requestID)
	case "getLayout", "setLayout":
		s.handleLayout(client, msgType, message)
	case "getPush", "subscribePush", "unsubscribePush", "testPush":
		s.handlePush(client, msgType, message)
	case "getVirtualKeys":
		s.handleVirtualKeys(client, requestID)
	case "getDeviceImages":
		s.handleDeviceImages(client, requestID)
	case "getRules", "saveRule", "deleteRule":
		s.handleRules(client, msgType, message)
	case "setGroupMember":
		s.handleSetGroupMember(client, message)
	case "setInstallMode", "getInstallMode", "getInbox", "acceptDevice", "deleteDevice", "listReplaceableDevices", "replaceDevice", "addDeviceBySerial", "setTempKey", "searchWiredDevices", "getInterfaces":
		s.handlePairing(client, msgType, message)
	case "installFirmware":
		s.handleInstallFirmware(client, message)
	case "checkDeviceFirmware", "downloadDeviceFirmware", "addDeviceFirmware":
		// eQ-3 and the HMServer may take minutes: the client's other
		// requests go on meanwhile
		go s.handleDeviceFirmware(client.snapshot(), msgType, message)
	case "getDeviceFirmware", "getDeviceFirmwareChangelog", "deleteDeviceFirmware":
		s.handleDeviceFirmware(client, msgType, message)
	case "getServiceMessages", "acknowledgeServiceMessage":
		s.handleServiceMessages(client, msgType, message)
	case "createGroup", "renameGroup", "deleteGroup":
		s.handleObjects(client, msgType, message)
	case "getFavorites", "createFavorite", "renameFavorite", "deleteFavorite", "addFavoriteItem", "removeFavoriteItem":
		s.handleFavorites(client, msgType, message)
	default:
		if s.dispatchPlatform(client, msgType, requestID, message) {
			return
		}
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
	// FavoriteID requests the channels of a favorite list (getChannels only)
	FavoriteID string `json:"favoriteId"`
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
	// ElevatedUntil is when the admin rights end (RFC 3339)
	ElevatedUntil string `json:"elevatedUntil,omitempty"`
	Token         string `json:"token,omitempty"`
	Error         string `json:"error,omitempty"`
	Code          string `json:"code,omitempty"`
	// What the add-on runs on and what it can do there (platform.go)
	Platform     string        `json:"platform,omitempty"`
	Capabilities *Capabilities `json:"capabilities,omitempty"`
}

// handleAuth checks a stored token. Every client sends this first after
// connecting; a valid token is renewed, so a device in regular use never
// has to log in again.
func (s *Server) handleAuth(client *Client, message []byte) {
	var msg struct {
		Token      string `json:"token"`
		AdminToken string `json:"adminToken"`
		// Logged out on purpose: show the login, not the automatic one
		NoAutoLogin bool `json:"noAutoLogin"`
	}
	_ = json.Unmarshal(message, &msg)

	if s.gate != nil {
		s.gateLogin(client)
		return
	}

	if s.auth == nil {
		// Without authentication everyone can do everything
		client.setSession("", auth.LevelAdmin)
		client.elevatedUntil = alwaysElevated
		s.sendAuth(client, authResponse{Type: "auth_response", Success: true, Level: auth.LevelAdmin, Elevated: true})
		return
	}

	session, token, err := s.auth.Refresh(msg.Token, client.device)
	if err != nil && !msg.NoAutoLogin {
		// The user the CCU logs in automatically, if one is set (not an
		// administrator, see AutoLogin)
		if user := s.autoLoginUser(); user != "" {
			session, token, err = s.auth.AutoLogin(user, client.device)
			if err == nil {
				logger.Info(fmt.Sprintf("🔓 User %q logged in automatically", user))
			}
		}
	}
	if err != nil {
		client.authenticated = false
		client.watchSysvars(false)
		client.unwatchMessages()
		s.sendAuth(client, authResponse{Type: "auth_response", AuthRequired: true, Code: "LOGIN_REQUIRED"})
		return
	}

	client.setSession(session.User, session.Level)
	client.setSessionID(session.ID)
	if msg.AdminToken != "" {
		if expiry, ok := s.auth.VerifyAdmin(msg.AdminToken, session.User); ok {
			client.elevatedUntil = expiry
		}
	}
	s.sendAuth(client, authResponse{
		Type: "auth_response", Success: true, AuthRequired: true, User: session.User, Level: session.Level,
		Token: token, Elevated: client.elevated(), ElevatedUntil: client.elevatedUntilText(),
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

	// The platform logs in (openccu-lite's login page)
	if s.gate != nil {
		s.gateLogin(client)
		return
	}

	if s.auth == nil {
		client.setSession("", auth.LevelAdmin)
		client.elevatedUntil = alwaysElevated
		s.sendAuth(client, authResponse{Type: "auth_response", Success: true, Level: auth.LevelAdmin, Elevated: true})
		return
	}

	session, token, err := s.auth.Login(msg.Username, msg.Password, client.device, client.source)
	if err != nil {
		code := "CCU_UNREACHABLE"
		switch err {
		case auth.ErrInvalidCredentials:
			code = "INVALID_CREDENTIALS"
		case auth.ErrTooManyAttempts:
			code = "TOO_MANY_ATTEMPTS"
		case auth.ErrCCUNotReady:
			code = "CCU_NOT_READY"
		}
		logger.Info(fmt.Sprintf("🔒 Login failed for user %q: %v", msg.Username, err))
		s.sendAuth(client, authResponse{Type: "auth_response", AuthRequired: true, Error: err.Error(), Code: code})
		return
	}

	logger.Info(fmt.Sprintf("🔓 User %q logged in", msg.Username))
	client.setSession(session.User, session.Level)
	client.setSessionID(session.ID)
	// The password was just entered: administrators may set up right away
	adminToken, err := s.auth.IssueAdminToken(session)
	if err == nil {
		client.elevatedUntil = s.auth.AdminTokenExpiry()
	}
	s.sendAuth(client, authResponse{
		Type: "auth_response", Success: true, AuthRequired: true, User: session.User, Level: session.Level,
		Token: token, AdminToken: adminToken, Elevated: client.elevated(), ElevatedUntil: client.elevatedUntilText(),
	})
}

type elevateResponse struct {
	Type       string `json:"type"`
	RequestID  string `json:"requestId,omitempty"`
	Success    bool   `json:"success"`
	AdminToken string `json:"adminToken,omitempty"`
	// ElevatedUntil is when the admin rights end (RFC 3339)
	ElevatedUntil string `json:"elevatedUntil,omitempty"`
}

// elevatedUntilText is when the client's admin rights end, for showing
// the time left; empty when not elevated or without authentication.
func (c *Client) elevatedUntilText() string {
	if !c.elevated() || c.elevatedUntil.Equal(alwaysElevated) {
		return ""
	}
	return c.elevatedUntil.UTC().Format(time.RFC3339)
}

// handleEndElevation gives up the admin rights of this device before they
// expire: its admin token stops working, it stays logged in. Other
// connections of the device reconnect and so drop their admin rights too.
func (s *Server) handleEndElevation(client *Client, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
	}
	_ = json.Unmarshal(message, &msg)
	if s.auth == nil {
		s.sendRequestError(client, msg.RequestID, "authentication is disabled", "NOT_AVAILABLE")
		return
	}
	client.elevatedUntil = time.Time{}
	if id := client.SessionID(); id != "" {
		s.auth.EndElevation(id)
		s.disconnectSession(id, client)
	}
	// The WebUI session kept for heating groups, security and the like
	s.endWebUISession(client.user)
	s.recordAudit(audit.Entry{User: client.user, Action: "endElevation"}, rega.SetOK)
	logger.Info(fmt.Sprintf("🔒 User %q gave up the admin rights", client.user))
	s.sendJSON(client, elevateResponse{Type: "endElevation_response", RequestID: msg.RequestID, Success: true})
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
	if s.gate != nil {
		// The platform's administrators are elevated already (gate.go),
		// nobody else is
		if client.gateSession.Level != auth.LevelAdmin {
			s.sendRequestError(client, msg.RequestID, "only administrators may change settings", "FORBIDDEN")
			return
		}
		client.elevatedUntil = alwaysElevated
		s.sendJSON(client, elevateResponse{Type: "elevate_response", RequestID: msg.RequestID, Success: true})
		return
	}
	if s.auth == nil {
		client.elevatedUntil = alwaysElevated
		s.sendJSON(client, elevateResponse{Type: "elevate_response", RequestID: msg.RequestID, Success: true})
		return
	}

	adminToken, err := s.auth.Elevate(client.user, msg.Password, client.SessionID(), client.source)
	if err != nil {
		code := "CCU_UNREACHABLE"
		switch err {
		case auth.ErrInvalidCredentials:
			code = "INVALID_CREDENTIALS"
		case auth.ErrTooManyAttempts:
			code = "TOO_MANY_ATTEMPTS"
		case auth.ErrCCUNotReady:
			code = "CCU_NOT_READY"
		case auth.ErrNotAdmin:
			code = "FORBIDDEN"
		}
		logger.Info(fmt.Sprintf("🔒 Elevation failed for user %q: %v", client.user, err))
		s.sendRequestError(client, msg.RequestID, err.Error(), code)
		return
	}
	client.elevatedUntil = s.auth.AdminTokenExpiry()
	s.sendJSON(client, elevateResponse{Type: "elevate_response", RequestID: msg.RequestID, Success: true, AdminToken: adminToken, ElevatedUntil: client.elevatedUntilText()})
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
	record := func(result string) { s.recordAudit(entry, result) }
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

	// The WebUI's channel option "bedienbar": off, only administrators
	if !s.operable(client, msg.Address) {
		fail("FORBIDDEN", "only administrators may operate this channel")
		return
	}

	result, previous, err := s.home.SetDatapoint(msg.InterfaceName, msg.Address, msg.Attribute, valueStr)
	if err != nil {
		fail("CCU_ERROR", "setDatapoint failed: "+err.Error())
		return
	}

	switch result {
	case rega.SetOK:
		entry.Previous = previous
		record(rega.SetOK)
		s.sendJSON(client, setDatapointResponse{Type: "setDatapoint_response", RequestID: msg.RequestID, Success: true})
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
	devices, err := s.home.GetDeviceProblems()
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
	// Values and settings only: with a partner address as key the CCU would
	// hand out the parameters of a direct link, which only administrators
	// may read (getLinkParamset)
	if msg.ParamsetKey != "VALUES" && msg.ParamsetKey != "MASTER" {
		s.sendRequestError(client, msg.RequestID, "paramsetKey must be VALUES or MASTER", "INVALID_REQUEST")
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
	// Channels with their link roles, for choosing link partners
	Channels []ccurpc.DeviceDescription `json:"channels,omitempty"`
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
	// The interfaces and ReGa (names) are asked at the same time: each
	// listDevices takes a while on a CCU with many devices
	interfaces := s.rpc.InterfaceNames()
	lists := make([][]ccurpc.DeviceDescription, len(interfaces))
	var names map[string]string
	var wg sync.WaitGroup
	if s.home != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			var err error
			// Without the names the list still works
			if names, err = s.home.GetDeviceNames(); err != nil {
				logger.Debugf("getDeviceNames: %v", err)
			}
		}()
	}
	for i, iface := range interfaces {
		wg.Add(1)
		go func(i int, iface string) {
			defer wg.Done()
			list, err := s.rpc.ListDevices(iface)
			if err != nil {
				logger.Debugf("listDevices %s: %v", iface, err)
				return
			}
			lists[i] = list
		}(i, iface)
	}
	wg.Wait()

	devices := []Device{}
	for i, iface := range interfaces {
		list := lists[i]
		channels := map[string][]ccurpc.DeviceDescription{}
		for _, d := range list {
			if d.Parent != "" {
				channels[d.Parent] = append(channels[d.Parent], d)
			}
		}
		for _, d := range list {
			if d.Parent == "" {
				devices = append(devices, Device{InterfaceName: iface, Name: names[d.Address], DeviceDescription: d, Channels: channels[d.Address]})
			}
		}
	}
	s.sendJSON(client, listDevicesResponse{Type: "devices", RequestID: requestID, Devices: devices})
}

type linksResponse struct {
	Type        string                     `json:"type"`
	RequestID   string                     `json:"requestId,omitempty"`
	Success     bool                       `json:"success"`
	Links       []ccurpc.Link              `json:"links,omitempty"`
	Description ccurpc.ParamsetDescription `json:"description,omitempty"`
	Values      map[string]interface{}     `json:"values,omitempty"`
}

// handleLinks: direct links and their parameters. Reading is for
// administrators, changing needs the admin token too.
func (s *Server) handleLinks(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID     string                 `json:"requestId"`
		InterfaceName string                 `json:"interfaceName"`
		Address       string                 `json:"address"`
		Partner       string                 `json:"partner"`
		Sender        string                 `json:"sender"`
		Receiver      string                 `json:"receiver"`
		Name          string                 `json:"name"`
		Values        map[string]interface{} `json:"values"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if s.rpc == nil {
		s.sendRequestError(client, msg.RequestID, msgType+" is not available", "NOT_AVAILABLE")
		return
	}
	respond := func(r linksResponse, err error) {
		if err != nil {
			s.sendRequestError(client, msg.RequestID, msgType+" failed: "+err.Error(), "CCU_ERROR")
			return
		}
		r.Type, r.RequestID, r.Success = msgType+"_response", msg.RequestID, true
		s.sendJSON(client, r)
	}

	switch msgType {
	case "getLinks", "getLinkParamsetDescription", "getLinkParamset":
		if client.level != auth.LevelAdmin {
			s.sendRequestError(client, msg.RequestID, "only administrators may set up devices", "FORBIDDEN")
			return
		}
	}

	switch msgType {
	case "getLinks":
		links, err := s.rpc.GetLinks(msg.InterfaceName, msg.Address)
		respond(linksResponse{Links: links}, err)
	case "getLinkParamsetDescription":
		description, err := s.rpc.GetLinkParamsetDescription(msg.InterfaceName, msg.Address, msg.Partner)
		respond(linksResponse{Description: description}, err)
	case "getLinkParamset":
		values, err := s.rpc.GetLinkParamset(msg.InterfaceName, msg.Address, msg.Partner)
		respond(linksResponse{Values: values}, err)
	case "addLink":
		entry := audit.Entry{Action: msgType, Target: msg.Sender + " > " + msg.Receiver, Value: msg.Name}
		s.configure(client, msg.RequestID, entry, func() (interface{}, string, error) {
			return nil, rega.SetOK, s.rpc.AddLink(msg.InterfaceName, msg.Sender, msg.Receiver, msg.Name, "")
		})
	case "removeLink":
		entry := audit.Entry{Action: msgType, Target: msg.Sender + " > " + msg.Receiver}
		s.configure(client, msg.RequestID, entry, func() (interface{}, string, error) {
			return nil, rega.SetOK, s.rpc.RemoveLink(msg.InterfaceName, msg.Sender, msg.Receiver)
		})
	case "putLinkParamset":
		entry := audit.Entry{Action: msgType, Target: msg.Address + " < " + msg.Partner}
		s.configure(client, msg.RequestID, entry, func() (interface{}, string, error) {
			description, err := s.rpc.GetLinkParamsetDescription(msg.InterfaceName, msg.Address, msg.Partner)
			if err != nil {
				return nil, "", err
			}
			values, err := ccurpc.CoerceValues(description, msg.Values)
			if err != nil {
				return nil, "", fmt.Errorf("invalid value: %w", err)
			}
			entry.Value = values
			var previous map[string]interface{}
			if current, err := s.rpc.GetLinkParamset(msg.InterfaceName, msg.Address, msg.Partner); err == nil {
				previous = map[string]interface{}{}
				for name := range values {
					previous[name] = current[name]
				}
			}
			return previous, rega.SetOK, s.rpc.PutLinkParamset(msg.InterfaceName, msg.Address, msg.Partner, values)
		})
	}
}

type sessionInfo struct {
	auth.SessionInfo
	// Current: this connection's device
	Current bool `json:"current"`
}

type sessionsResponse struct {
	Type      string        `json:"type"`
	RequestID string        `json:"requestId,omitempty"`
	Success   bool          `json:"success"`
	Sessions  []sessionInfo `json:"sessions,omitempty"`
}

// handleSessions: the list of logged-in devices (administrators), logging
// one out, and logging out this device itself (everyone).
func (s *Server) handleSessions(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		ID        string `json:"id"`
	}
	_ = json.Unmarshal(message, &msg)
	if s.auth == nil {
		s.sendRequestError(client, msg.RequestID, "authentication is disabled", "NOT_AVAILABLE")
		return
	}

	switch msgType {
	case "logout":
		if id := client.SessionID(); id != "" {
			s.auth.Revoke(id)
			// Other tabs of this device
			s.disconnectSession(id, client)
		}
		s.endWebUISession(client.user)
		client.watchSysvars(false)
		client.unwatchMessages()
		if s.auth != nil {
			// This connection is logged out too, not only the others
			client.setSession("", auth.LevelUnknown)
			client.authenticated = false
			client.setSessionID("")
		}
		s.sendJSON(client, sessionsResponse{Type: "logout_response", RequestID: msg.RequestID, Success: true})
	case "listSessions":
		if code, errorMsg := configureError(client); code != "" {
			s.sendRequestError(client, msg.RequestID, errorMsg, code)
			return
		}
		list := []sessionInfo{}
		for _, info := range s.auth.Sessions() {
			list = append(list, sessionInfo{SessionInfo: info, Current: info.ID == client.SessionID()})
		}
		s.sendJSON(client, sessionsResponse{Type: "listSessions_response", RequestID: msg.RequestID, Success: true, Sessions: list})
	case "revokeSession":
		s.configure(client, msg.RequestID, audit.Entry{Action: "revokeSession", Target: msg.ID}, func() (interface{}, string, error) {
			if !s.auth.Revoke(msg.ID) {
				return nil, rega.SetNotFound, nil
			}
			s.disconnectSession(msg.ID, client)
			return nil, rega.SetOK, nil
		})
	}
}

// endWebUISession logs out the WebUI session kept for a user, if any
func (s *Server) endWebUISession(user string) {
	if s.backup != nil && user != "" {
		s.backup.EndWebUISession(user)
	}
}

// disconnectSession closes the connections of a logged-out device (except
// the one asking): they reconnect and are asked to log in.
func (s *Server) disconnectSession(id string, except *Client) {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()
	for c := range s.clients {
		if c != except && c.SessionID() == id && c.conn != nil {
			_ = c.conn.Close()
		}
	}
}

type interfacesResponse struct {
	Type       string   `json:"type"`
	RequestID  string   `json:"requestId,omitempty"`
	Success    bool     `json:"success"`
	Interfaces []string `json:"interfaces"`
}

type changeResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	Success   bool   `json:"success"`
	// ID of a created object
	ID int64 `json:"id,omitempty"`
}

// configure runs a change of the setup area for client: checks that it may
// change settings, runs change and records the outcome. change returns the
// previous value (for the audit log) and a ReGa result.
// createdID, if given, is set by change to the id of a created object and
// sent with the response.
func (s *Server) configure(client *Client, requestID string, entry audit.Entry, change func() (previous interface{}, result string, err error), createdID ...*int64) {
	entry.User = client.user
	finish := func(result string) { s.recordAudit(entry, result) }
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
	response := changeResponse{Type: entry.Action + "_response", RequestID: requestID, Success: true}
	if len(createdID) > 0 && createdID[0] != nil {
		response.ID = *createdID[0]
	}
	s.sendJSON(client, response)
}

type alarmMessagesResponse struct {
	Type      string              `json:"type"`
	RequestID string              `json:"requestId,omitempty"`
	Alarms    []rega.AlarmMessage `json:"alarms"`
}

type serviceMessagesResponse struct {
	Type      string                `json:"type"`
	RequestID string                `json:"requestId,omitempty"`
	Messages  []rega.ServiceMessage `json:"messages"`
}

// handleServiceMessages lists the CCU's service messages and acknowledges
// them. Acknowledging is operating, like in the WebUI: not for guests.
func (s *Server) handleServiceMessages(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		ID        int64  `json:"id"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	switch msgType {
	case "getServiceMessages":
		messages, err := s.readServiceMessages(0)
		if err != nil {
			s.sendRequestError(client, msg.RequestID, "getServiceMessages failed: "+err.Error(), "CCU_ERROR")
			return
		}
		client.watchMessages(false)
		s.sendJSON(client, serviceMessagesResponse{Type: "getServiceMessages_response", RequestID: msg.RequestID, Messages: s.hideStickyUnreach(messages)})
		return
	case "getAlarmMessages":
		alarms, err := s.readAlarms(0)
		if err != nil {
			s.sendRequestError(client, msg.RequestID, "getAlarmMessages failed: "+err.Error(), "CCU_ERROR")
			return
		}
		client.watchMessages(true)
		s.sendJSON(client, alarmMessagesResponse{Type: "getAlarmMessages_response", RequestID: msg.RequestID, Alarms: alarms})
		return
	}
	alarm := msgType == "acknowledgeAlarmMessage"
	target := fmt.Sprintf("service message %d", msg.ID)
	if alarm {
		target = fmt.Sprintf("alarm %d", msg.ID)
	}
	entry := audit.Entry{User: client.user, Action: msgType, Target: target}
	finish := func(result string) { s.recordAudit(entry, result) }
	if !canOperate(client.level) {
		finish("FORBIDDEN")
		s.sendRequestError(client, msg.RequestID, "guests may not acknowledge messages", "FORBIDDEN")
		return
	}
	acknowledge := s.home.AcknowledgeServiceMessage
	if alarm {
		acknowledge = s.regaClient.AcknowledgeAlarmMessage
	}
	result, messageType, err := acknowledge(msg.ID)
	if err != nil {
		finish("CCU_ERROR")
		s.sendRequestError(client, msg.RequestID, msgType+" failed: "+err.Error(), "CCU_ERROR")
		return
	}
	entry.Previous = messageType
	finish(result)
	if result != rega.SetOK {
		s.sendRequestError(client, msg.RequestID, msgType+": "+result, result)
		return
	}
	s.sendJSON(client, changeResponse{Type: msgType + "_response", RequestID: msg.RequestID, Success: true})
}

// handleInstallFirmware starts the update of a device to the firmware the
// CCU has for it. Setup, for administrators only. DEVICE_UNREACHABLE asks
// to wake the device, DUTY_CYCLE_HIGH to try again later.
func (s *Server) handleInstallFirmware(client *Client, message []byte) {
	var msg struct {
		RequestID     string `json:"requestId"`
		InterfaceName string `json:"interfaceName"`
		Address       string `json:"address"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if s.rpc == nil {
		s.sendRequestError(client, msg.RequestID, "installFirmware is not available", "NOT_AVAILABLE")
		return
	}
	// One update per device: a second updateFirmware would hit a device
	// that is in its bootloader for the first
	if _, running := s.firmwareUpdates.LoadOrStore(msg.InterfaceName+" "+msg.Address, true); running {
		s.sendRequestError(client, msg.RequestID, "an update of this device is already running", "UPDATE_RUNNING")
		return
	}
	// A BidCos update answers only after minutes: the client's other
	// requests go on meanwhile, as in the WebUI the answer is waited for
	go s.installFirmware(client.snapshot(), msg.RequestID, msg.InterfaceName, msg.Address)
}

func (s *Server) installFirmware(client *Client, requestID, iface, address string) {
	defer s.firmwareUpdates.Delete(iface + " " + address)
	s.configure(client, requestID, audit.Entry{Action: "installFirmware", Target: iface + " " + address},
		func() (interface{}, string, error) {
			err := s.rpc.InstallFirmware(iface, address)
			if err == nil {
				s.smokeTestAfterUpdate(iface, address)
			}
			switch {
			case errors.Is(err, ccurpc.ErrDeviceUnreachable):
				return nil, "DEVICE_UNREACHABLE", nil
			case errors.Is(err, ccurpc.ErrDutyCycleHigh):
				return nil, "DUTY_CYCLE_HIGH", nil
			case err != nil:
				return nil, "", err
			}
			return nil, rega.SetOK, nil
		})
}

// smokeTestAfterUpdate: a smoke detector asks for its self-test after a
// firmware update, as the WebUI resets it (ic_ifacecmd.cgi: metadata
// smokeTestDone=false on <address>:1, hintActivateDetectorSelfTest)
func (s *Server) smokeTestAfterUpdate(iface, address string) {
	device, err := s.rpc.GetDeviceDescription(iface, address)
	if err != nil || (device.Type != "HmIP-SWSD" && device.Type != "HmIP-SWSD-2") {
		return
	}
	if err := s.rpc.SetMetadata("HmIP-RF", address+":1", "smokeTestDone", false); err != nil {
		logger.Error("Failed to reset smokeTestDone:", err)
	}
}

// handleObjects creates, renames and deletes rooms, trades and system
// variables. All of it is setup.
func (s *Server) handleObjects(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		List      string `json:"list"`
		ID        int64  `json:"id"`
		Name      string `json:"name"`
		rega.NewSysvar
		// editSysvar: the info text and the channel (0: none)
		Description string `json:"description"`
		Channel     int64  `json:"channel"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	target := fmt.Sprintf("%s %d", msg.List, msg.ID)
	if strings.HasSuffix(msgType, "Sysvar") {
		target = fmt.Sprintf("sysvar %d", msg.ID)
	}
	var created int64
	switch msgType {
	case "createGroup":
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: msg.List, Value: msg.Name},
			func() (interface{}, string, error) {
				result, id, err := s.home.CreateGroup(msg.List, msg.Name)
				created = id
				return nil, result, err
			}, &created)
	case "renameGroup":
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: target, Value: msg.Name},
			func() (interface{}, string, error) {
				result, previous, err := s.home.RenameGroup(msg.List, msg.ID, msg.Name)
				return previous, result, err
			})
	case "deleteGroup":
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: target},
			func() (interface{}, string, error) {
				result, previous, err := s.home.DeleteGroup(msg.List, msg.ID)
				return previous, result, err
			})
	case "createSysvar":
		// The outer Name takes the JSON field; the embedded one stays empty
		sysvar := msg.NewSysvar
		sysvar.Name = msg.Name
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: msg.Kind, Value: msg.Name},
			func() (interface{}, string, error) {
				result, id, err := s.regaClient.CreateSysvar(sysvar)
				created = id
				return nil, result, err
			}, &created)
	case "editSysvar":
		sysvar := msg.NewSysvar
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: target, Value: sysvar},
			func() (interface{}, string, error) {
				result, err := s.regaClient.EditSysvar(msg.ID, sysvar, msg.Description, msg.Channel)
				return nil, result, err
			})
	case "renameSysvar":
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: target, Value: msg.Name},
			func() (interface{}, string, error) {
				result, previous, err := s.regaClient.RenameSysvar(msg.ID, msg.Name)
				return previous, result, err
			})
	case "deleteSysvar":
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: target},
			func() (interface{}, string, error) {
				result, previous, err := s.regaClient.DeleteSysvar(msg.ID)
				return previous, result, err
			})
	}
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
			result, previous, err := s.home.SetName(msg.Address, msg.Name)
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
			result, err := s.home.SetGroupMember(msg.GroupID, msg.ChannelID, msg.Member)
			return !msg.Member, result, err
		})
}

type logicResponse struct {
	Type      string         `json:"type"`
	RequestID string         `json:"requestId,omitempty"`
	Success   bool           `json:"success"`
	Sysvars   []rega.Sysvar  `json:"sysvars,omitempty"`
	Programs  []rega.Program `json:"programs,omitempty"`
}

// handleLogic: system variables and programs. Reading, setting a variable
// and running a program is operating (not for guests); switching a
// program on or off is setup.
func (s *Server) handleLogic(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string      `json:"requestId"`
		ID        int64       `json:"id"`
		Value     interface{} `json:"value"`
		Active    bool        `json:"active"`
		// setLogicOption: "visible" or "operate"
		Option string `json:"option"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	respond := func(r logicResponse) {
		r.Type, r.RequestID, r.Success = msgType+"_response", msg.RequestID, true
		s.sendJSON(client, r)
	}

	switch msgType {
	case "getSysvars":
		sysvars, err := s.regaClient.GetSysvars()
		if err != nil {
			s.sendRequestError(client, msg.RequestID, "getSysvars failed: "+err.Error(), "CCU_ERROR")
			return
		}
		client.watchSysvars(true)
		respond(logicResponse{Sysvars: sysvars})
		return
	case "getPrograms":
		programs, err := s.regaClient.GetPrograms()
		if err != nil {
			s.sendRequestError(client, msg.RequestID, "getPrograms failed: "+err.Error(), "CCU_ERROR")
			return
		}
		respond(logicResponse{Programs: programs})
		return
	case "setProgramActive":
		action := rega.ProgramOff
		if msg.Active {
			action = rega.ProgramOn
		}
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: fmt.Sprintf("program %d", msg.ID), Value: msg.Active},
			func() (interface{}, string, error) {
				result, err := s.regaClient.ProgramAction(msg.ID, action)
				return !msg.Active, result, err
			})
		return
	case "setLogicOption":
		value, isBool := msg.Value.(bool)
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: fmt.Sprintf("%d %s", msg.ID, msg.Option), Value: msg.Value},
			func() (interface{}, string, error) {
				if !isBool {
					return nil, "", fmt.Errorf("invalid value")
				}
				result, previous, err := s.regaClient.SetLogicOption(msg.ID, msg.Option, value)
				return previous, result, err
			})
		return
	}

	// setSysvar, runProgram: operating
	entry := audit.Entry{User: client.user, Action: msgType, Target: fmt.Sprintf("%d", msg.ID), Value: msg.Value}
	finish := func(result string) { s.recordAudit(entry, result) }
	if !canOperate(client.level) {
		finish("FORBIDDEN")
		s.sendRequestError(client, msg.RequestID, "guests may not control devices", "FORBIDDEN")
		return
	}
	var result string
	var err error
	if msgType == "runProgram" {
		entry.Target = fmt.Sprintf("program %d", msg.ID)
		entry.Value = nil
		// Only programs marked "bedienbar" for users other than administrators
		if client.level != auth.LevelAdmin && !s.programOperable(msg.ID) {
			finish("FORBIDDEN")
			s.sendRequestError(client, msg.RequestID, "this program may only be run by administrators", "FORBIDDEN")
			return
		}
		result, err = s.regaClient.ProgramAction(msg.ID, rega.ProgramRun)
	} else {
		entry.Target = fmt.Sprintf("sysvar %d", msg.ID)
		var value, previous string
		if value, err = formatValue(msg.Value); err == nil {
			// The app sends numbers and booleans as such; a string is the
			// text of a string variable
			_, text := msg.Value.(string)
			result, previous, err = s.regaClient.SetSysvar(msg.ID, value, text)
			entry.Previous = previous
		}
	}
	if err != nil {
		finish("CCU_ERROR")
		s.sendRequestError(client, msg.RequestID, msgType+" failed: "+err.Error(), "CCU_ERROR")
		return
	}
	finish(result)
	if result != rega.SetOK {
		s.sendRequestError(client, msg.RequestID, msgType+": "+result, result)
		return
	}
	respond(logicResponse{})
}

type pairingResponse struct {
	Type      string             `json:"type"`
	RequestID string             `json:"requestId,omitempty"`
	Success   bool               `json:"success"`
	Seconds   *int               `json:"seconds,omitempty"`
	Devices   []rega.InboxDevice `json:"devices,omitempty"`
	// BidCos-RF: a device that failed to pair in install mode for another
	// system security key (getKeyMismatchDevice)
	KeyMismatch string `json:"keyMismatch,omitempty"`
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
		// replaceDevice: the device the new one (Address) replaces
		OldAddress string `json:"oldAddress"`
		// setInstallMode on HmIP: pair only this device with its local key,
		// without the key server (SGTIN and KEY from its label)
		SGTIN string `json:"sgtin"`
		Key   string `json:"key"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if s.rpc == nil {
		s.sendRequestError(client, msg.RequestID, msgType+" is not available", "NOT_AVAILABLE")
		return
	}

	// HmIP can't replace devices (ic_seldevice.cgi leaves HmIP out)
	if (msgType == "listReplaceableDevices" || msgType == "replaceDevice") && msg.InterfaceName == "HmIP-RF" {
		s.sendRequestError(client, msg.RequestID, "HmIP devices can't be replaced", "NOT_SUPPORTED")
		return
	}

	// Reading is allowed for administrators even without admin token
	switch msgType {
	case "listReplaceableDevices":
		if client.level != auth.LevelAdmin {
			s.sendRequestError(client, msg.RequestID, "only administrators may set up devices", "FORBIDDEN")
			return
		}
		devices, err := s.rpc.ListReplaceableDevices(msg.InterfaceName, msg.Address)
		if err != nil {
			s.sendRequestError(client, msg.RequestID, "listReplaceableDevices failed: "+err.Error(), "CCU_ERROR")
			return
		}
		s.sendJSON(client, replaceableResponse{Type: "listReplaceableDevices_response", RequestID: msg.RequestID, Devices: devices})
		return
	case "getInterfaces":
		// Which interfaces are connected: BidCos-Wired only with a Wired
		// gateway (InterfacesList.xml)
		if client.level != auth.LevelAdmin {
			s.sendRequestError(client, msg.RequestID, "only administrators may set up devices", "FORBIDDEN")
			return
		}
		s.sendJSON(client, interfacesResponse{Type: "getInterfaces_response", RequestID: msg.RequestID, Success: true, Interfaces: s.rpc.InterfaceNames()})
		return
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
			if msg.InterfaceName == "BidCos-RF" {
				// As cp_add_device.cgi action_get_install_status; the CCU
				// forgets the device once it is read
				response.KeyMismatch, _ = s.rpc.KeyMismatchDevice(msg.InterfaceName, true)
			}
		} else {
			devices, err := s.home.GetInbox()
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
		if msg.SGTIN != "" || msg.Key != "" {
			// The key is never written to the audit log
			entry.Value = map[string]interface{}{"on": msg.On, "seconds": msg.Seconds, "sgtin": msg.SGTIN}
		}
		s.configure(client, msg.RequestID, entry, func() (interface{}, string, error) {
			if msg.On && (msg.SGTIN != "" || msg.Key != "") {
				if !strings.HasPrefix(msg.InterfaceName, "HmIP") {
					return nil, "", errors.New("invalid: only HmIP pairs with SGTIN and key")
				}
				sgtin, key, err := ccurpc.HmIPWhitelistEntry(msg.SGTIN, msg.Key)
				if err != nil {
					return nil, "", fmt.Errorf("invalid: %w", err)
				}
				return nil, rega.SetOK, s.rpc.SetInstallModeWithWhitelist(msg.InterfaceName, msg.Seconds, sgtin, key)
			}
			return nil, rega.SetOK, s.rpc.SetInstallMode(msg.InterfaceName, msg.On, msg.Seconds)
		})
	case "addDeviceBySerial":
		entry.Target = msg.InterfaceName + "." + strings.ToUpper(msg.Address)
		s.configure(client, msg.RequestID, entry, func() (interface{}, string, error) {
			if msg.InterfaceName != "BidCos-RF" {
				return nil, "", errors.New("invalid: only BidCos-RF pairs by serial number")
			}
			err := s.rpc.AddDevice(msg.InterfaceName, strings.ToUpper(strings.TrimSpace(msg.Address)))
			if errors.Is(err, ccurpc.ErrKeyMismatch) {
				return nil, "KEY_MISMATCH", nil
			}
			if errors.Is(err, ccurpc.ErrInvalidAddress) {
				return nil, "", errors.New("invalid serial number")
			}
			return nil, rega.SetOK, err
		})
	case "searchWiredDevices":
		entry.Target = "BidCos-Wired"
		s.configure(client, msg.RequestID, entry, func() (interface{}, string, error) {
			_, err := s.rpc.SearchDevices("BidCos-Wired")
			return nil, rega.SetOK, err
		})
	case "setTempKey":
		// The key itself is never written to the audit log
		entry.Target = msg.InterfaceName
		s.configure(client, msg.RequestID, entry, func() (interface{}, string, error) {
			if msg.InterfaceName != "BidCos-RF" || msg.Key == "" || len(msg.Key) > 64 || strings.ContainsAny(msg.Key, "\r\n") {
				return nil, "", errors.New("invalid temporary key")
			}
			return nil, rega.SetOK, s.rpc.SetTempKey(msg.InterfaceName, msg.Key)
		})
	case "acceptDevice":
		entry.Target = msg.Address
		s.configure(client, msg.RequestID, entry, func() (interface{}, string, error) {
			result, err := s.home.AcceptDevice(msg.Address)
			return nil, result, err
		})
	case "replaceDevice":
		entry.Value = map[string]interface{}{"replaces": msg.OldAddress}
		s.configure(client, msg.RequestID, entry, func() (interface{}, string, error) {
			if err := s.rpc.ReplaceDevice(msg.InterfaceName, msg.OldAddress, msg.Address); err != nil {
				return nil, "", err
			}
			s.rpc.Forget(msg.InterfaceName, msg.OldAddress)
			s.rpc.Forget(msg.InterfaceName, msg.Address)
			return nil, rega.SetOK, nil
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

type replaceableResponse struct {
	Type      string                     `json:"type"`
	RequestID string                     `json:"requestId,omitempty"`
	Devices   []ccurpc.DeviceDescription `json:"devices"`
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
		s.recordAudit(entry, code)
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
	s.recordAudit(entry, "OK")
	if mode, ok := values["CHANNEL_OPERATION_MODE"]; ok {
		s.storeChannelMode(msg.InterfaceName, msg.Address, mode)
	}
	s.sendJSON(client, putParamsetResponse{Type: "putParamset_response", RequestID: msg.RequestID, Success: true})
}

// storeChannelMode remembers what an input channel is wired to after its
// CHANNEL_OPERATION_MODE was saved: the WebUI stores it as metadata
// "channelMode" in the interface process (Interface.setMetadata_crRFD,
// HmIP only) and in ReGa (Interface.setMetadata), where the status pages
// read it (webui.js, after saving MASTER; functions.fn). Failures are only
// logged: the setting itself is saved.
func (s *Server) storeChannelMode(iface, address string, value interface{}) {
	mode, ok := value.(int)
	if !ok {
		return
	}
	description, err := s.rpc.GetDeviceDescription(iface, address)
	if err != nil || description.Type != "MULTI_MODE_INPUT_TRANSMITTER" {
		return
	}
	if iface == "HmIP-RF" {
		if err := s.rpc.SetMetadata(iface, address, "channelMode", mode); err != nil {
			logger.Error(fmt.Sprintf("setMetadata channelMode %s: %v", address, err))
		}
	}
	if s.home != nil {
		if result, err := s.home.SetChannelMode(iface, address, mode); err != nil || result != "OK" {
			logger.Error(fmt.Sprintf("SetChannelMode %s: %s %v", address, result, err))
		}
	}
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
	case <-client.done:
		// Disconnected: nobody reads the answer any more
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

type backupResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	Success   bool   `json:"success"`
	URL       string `json:"url"`
	FileName  string `json:"fileName"`
	Size      int64  `json:"size"`
}

// handleCreateBackup lets the WebUI create a backup and returns where to
// download it, once and within a few minutes. A backup holds every
// setting and password of the CCU: it takes an elevated administrator and
// the password once more, which the WebUI needs for its session anyway.
func (s *Server) handleCreateBackup(client *Client, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		Password  string `json:"password"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_MESSAGE")
		return
	}
	if s.backup == nil {
		s.sendRequestError(client, msg.RequestID, "createBackup is not available", "NOT_AVAILABLE")
		return
	}
	entry := audit.Entry{User: client.user, Action: "createBackup", Target: "CCU"}
	finish := func(result string) { s.recordAudit(entry, result) }
	if code, errorMsg := configureError(client); code != "" {
		finish(code)
		s.sendRequestError(client, msg.RequestID, errorMsg, code)
		return
	}

	// Without authentication the WebUI's administrator
	username := client.user
	if s.auth == nil {
		username = "Admin"
	} else if err := s.auth.CheckLockout(username, client.source); err != nil {
		finish("TOO_MANY_ATTEMPTS")
		s.sendRequestError(client, msg.RequestID, err.Error(), "TOO_MANY_ATTEMPTS")
		return
	}

	created, err := s.backup.Create(username, msg.Password)
	if err != nil {
		code := "CCU_ERROR"
		if errors.Is(err, backup.ErrInvalidCredentials) {
			code = "INVALID_CREDENTIALS"
			if s.auth != nil {
				s.auth.RecordFailure(username, client.source)
			}
		}
		logger.Info(fmt.Sprintf("💾 Backup failed for user %q: %v", username, err))
		finish(code)
		s.sendRequestError(client, msg.RequestID, "createBackup failed: "+err.Error(), code)
		return
	}
	logger.Info(fmt.Sprintf("💾 Backup %s created (%d bytes)", created.FileName, created.Size))
	finish(rega.SetOK)
	s.sendJSON(client, backupResponse{
		Type: "createBackup_response", RequestID: msg.RequestID, Success: true,
		URL: BackupPath + created.ID, FileName: created.FileName, Size: created.Size,
	})
}

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

type programResponse struct {
	Type      string                  `json:"type"`
	RequestID string                  `json:"requestId,omitempty"`
	Program   *rega.ProgramDefinition `json:"program"`
}

// handleProgramEditor reads a program with its rules, saves one (new or
// changed) or deletes one. Changing is setup: administrators only.
func (s *Server) handleProgramEditor(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string                 `json:"requestId"`
		ID        int64                  `json:"id"`
		Program   rega.ProgramDefinition `json:"program"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	switch msgType {
	case "getProgram":
		program, err := s.regaClient.GetProgram(msg.ID)
		if err != nil {
			s.sendRequestError(client, msg.RequestID, "getProgram failed: "+err.Error(), "CCU_ERROR")
			return
		}
		if program == nil {
			s.sendRequestError(client, msg.RequestID, "getProgram: "+rega.SetNotFound, rega.SetNotFound)
			return
		}
		s.sendJSON(client, programResponse{Type: "getProgram_response", RequestID: msg.RequestID, Program: program})
	case "saveProgram":
		var created int64
		target := fmt.Sprintf("program %d", msg.Program.ID)
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: target, Value: msg.Program.Name},
			func() (interface{}, string, error) {
				result, id, err := s.regaClient.SaveProgram(msg.Program)
				created = id
				return nil, result, err
			}, &created)
	case "deleteProgram":
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: fmt.Sprintf("program %d", msg.ID)},
			func() (interface{}, string, error) {
				result, name, err := s.regaClient.DeleteProgram(msg.ID)
				return name, result, err
			})
	}
}

type interfaceLink struct {
	InterfaceName string `json:"interfaceName"`
	ccurpc.Link
}

type allLinksResponse struct {
	Type      string          `json:"type"`
	RequestID string          `json:"requestId,omitempty"`
	Links     []interfaceLink `json:"links"`
}

// handleAllLinks lists the direct links of all interfaces, like the WebUI's
// "Direkte Verknüpfungen". Interfaces without links (or not reachable)
// are skipped, as the WebUI does. Setup, for administrators.
func (s *Server) handleAllLinks(client *Client, requestID string) {
	if client.level != auth.LevelAdmin {
		s.sendRequestError(client, requestID, "only administrators may set up devices", "FORBIDDEN")
		return
	}
	links := []interfaceLink{}
	for _, iface := range []string{"BidCos-RF", "HmIP-RF", "BidCos-Wired"} {
		found, err := s.rpc.GetAllLinks(iface)
		if err != nil {
			continue
		}
		for _, link := range found {
			links = append(links, interfaceLink{InterfaceName: iface, Link: link})
		}
	}
	s.sendJSON(client, allLinksResponse{Type: "getAllLinks_response", RequestID: requestID, Links: links})
}

// SetTiles enables tile layouts and the tiles chosen for channels
func (s *Server) SetTiles(store *tiles.Store) {
	s.tiles = store
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
		code := "CCU_ERROR"
		if errors.Is(err, tiles.ErrInvalid) {
			code = "INVALID_VALUE"
		}
		finish(code)
		s.sendRequestError(client, msg.RequestID, "setLayout failed: "+err.Error(), code)
		return
	}
	finish(rega.SetOK)
	s.sendJSON(client, changeResponse{Type: "setLayout_response", RequestID: msg.RequestID, Success: true})
}

type pushResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	// The key browsers subscribe with
	PublicKey string `json:"publicKey"`
	// The device's subscription, if any
	Subscribed bool `json:"subscribed"`
	Alarms     bool `json:"alarms"`
	Service    bool `json:"service"`
	Rules      bool `json:"rules"`
}

// handlePush subscribes a device to notifications about new alarms and
// service messages, and sends test notifications. Any logged-in user.
func (s *Server) handlePush(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID    string            `json:"requestId"`
		Endpoint     string            `json:"endpoint"`
		Subscription push.Subscription `json:"subscription"`
		Alarms       bool              `json:"alarms"`
		Service      bool              `json:"service"`
		Rules        bool              `json:"rules"`
		Language     string            `json:"language"`
		Device       string            `json:"device"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if s.notifier == nil {
		s.sendRequestError(client, msg.RequestID, "push notifications are not available", "UNAVAILABLE")
		return
	}
	switch msgType {
	case "getPush":
		entry, ok := s.pushStore.Get(msg.Endpoint)
		s.sendJSON(client, pushResponse{
			Type: "getPush_response", RequestID: msg.RequestID, PublicKey: s.notifier.PublicKey(),
			Subscribed: ok && msg.Endpoint != "", Alarms: entry.Alarms, Service: entry.Service, Rules: entry.Rules,
		})
		return
	case "subscribePush":
		u, err := url.Parse(msg.Subscription.Endpoint)
		if err != nil || u.Scheme != "https" || u.Host == "" || msg.Subscription.Keys.P256dh == "" || msg.Subscription.Keys.Auth == "" {
			s.sendRequestError(client, msg.RequestID, "invalid subscription", "INVALID_VALUE")
			return
		}
		language := "de"
		if msg.Language == "en" {
			language = "en"
		}
		err = s.pushStore.Put(push.Entry{
			Subscription: msg.Subscription, User: client.user, Device: msg.Device, Language: language,
			Alarms: msg.Alarms, Service: msg.Service, Rules: msg.Rules, Created: time.Now(),
		})
		if err != nil {
			s.sendRequestError(client, msg.RequestID, "subscribePush failed: "+err.Error(), "CCU_ERROR")
			return
		}
	case "unsubscribePush":
		if _, err := s.pushStore.Remove(msg.Endpoint); err != nil {
			s.sendRequestError(client, msg.RequestID, "unsubscribePush failed: "+err.Error(), "CCU_ERROR")
			return
		}
	case "testPush":
		if err := s.notifier.Test(msg.Endpoint, "ccu-addon-mui", "Test"); err != nil {
			s.sendRequestError(client, msg.RequestID, "testPush failed: "+err.Error(), "PUSH_FAILED")
			return
		}
	}
	s.sendJSON(client, changeResponse{Type: msgType + "_response", RequestID: msg.RequestID, Success: true})
}

// programOperable: the program may be run by users other than
// administrators (UserAccessRights full access); unknown programs too, so
// ProgramAction reports them
func (s *Server) programOperable(id int64) bool {
	programs, err := s.regaClient.GetPrograms()
	if err != nil {
		return false
	}
	for _, p := range programs {
		if p.ID == id {
			return p.Operate
		}
	}
	return true
}
