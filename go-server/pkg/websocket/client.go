package websocket

import (
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"

	"ccu-addon-mui-server/pkg/auth"
)

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
	// gateRequest is the WebSocket upgrade, to ask the gate again: when
	// the platform could not tell at connect (gateErr) and while the
	// connection is open (watchGate)
	gateRequest *http.Request
	gateErr     error
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
		device: c.device, source: c.source, gateSession: c.gateSession, gateOK: c.gateOK,
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

// elevatedUntilText is when the client's admin rights end, for showing
// the time left; empty when not elevated or without authentication.
func (c *Client) elevatedUntilText() string {
	if !c.elevated() || c.elevatedUntil.Equal(alwaysElevated) {
		return ""
	}
	return c.elevatedUntil.UTC().Format(time.RFC3339)
}
