package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"ccu-addon-mui-server/pkg/addons"
	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/backup"
	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/diagrams"
	"ccu-addon-mui-server/pkg/home"
	"ccu-addon-mui-server/pkg/logger"
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

	logger.Errorf("❌ Rejected WebSocket connection from origin %q (host %q)", origin, r.Host)
	return false
}

func hostname(hostport string) string {
	if u, err := url.Parse("//" + hostport); err == nil && u.Hostname() != "" {
		return u.Hostname()
	}
	return hostport
}

type Server struct {
	// Device firmware updates running, by "<interface> <address>"
	firmwareUpdates sync.Map
	cfg             *config.Config
	// Channels non-administrators may not operate
	readOnly cached[map[string]bool]
	// The LOW_BAT limits of the device types (health.go)
	lowBatLimits lowBatLimitCache
	addons       *addons.Service
	// What only a CCU has (state_ccu.go); empty on openccu-lite
	ccuState //lint:ignore U1000 empty on openccu-lite, filled on a CCU
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
	home            home.Source
	clients         map[*Client]bool
	clientsMu       sync.RWMutex
	messages        messageWatch
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
	deviceFirmwareCatalog cached[[]DeviceFirmwareVersion]

	// audit records every change; nil disables it
	audit *audit.Log

	// What the add-on runs on (platform.go)
	platform     string
	capabilities Capabilities
	// The platform's login gate, nil to log in here (gate.go)
	gate GateFunc
	// Heating groups kept elsewhere than in the HMServer (heating_groups.go),
	// and as a user's session changes them
	groups        GroupService
	groupSessions func(session string) GroupService
	// deviceImageBase: where the app loads the device pictures from, when
	// not from DeviceImagePath (SetDeviceImageBase)
	deviceImageBase string
}

// DeviceRPC is the part of ccurpc.Client the server uses.
type DeviceRPC interface {
	GetParamsetDescription(iface, address, paramsetKey string) (ccurpc.ParamsetDescription, error)
	GetParamset(iface, address, paramsetKey string) (map[string]any, error)
	PutParamset(iface, address, paramsetKey string, values map[string]any) error
	GetDeviceDescription(iface, address string) (ccurpc.DeviceDescription, error)
	SetMetadata(iface, address, dataID string, value any) error
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
	GetLinkParamset(iface, address, partner string) (map[string]any, error)
	PutLinkParamset(iface, address, partner string, values map[string]any) error
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

	logger.Infof("WebSocket Server running on %s", s.httpServer.Addr)

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
			logger.Errorf("   ⚠️ Device %s buffer full, dropping message and closing the connection", client.DeviceID())
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
		client.gateRequest = r.Clone(context.Background())
		s.checkGate(client)
	}

	// Read before readPump runs: a login may ask the gate again (gateLogin)
	watch := client.gateOK

	s.addClient(client)

	go s.writePump(client)
	go s.readPump(client)
	if watch {
		go s.watchGate(client, gateRecheck)
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
			logger.Errorf("Panic while %s: %v\n%s", what, r, debug.Stack())
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

// send queues a message without blocking. A full buffer means the write pump
// is gone or the client stopped reading; blocking here would hang the read
// pump, so the client would never be removed.
func (s *Server) send(client *Client, message []byte) {
	select {
	case <-client.done:
		// Disconnected: nobody reads the answer any more
	case client.send <- message:
	default:
		logger.Errorf("⚠️ Device %s buffer full, dropping response", client.DeviceID())
	}
}

func (s *Server) sendJSON(client *Client, data any) {
	message, err := json.Marshal(data)
	if err != nil {
		logger.Error("Failed to marshal response:", err)
		return
	}
	s.send(client, message)
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
