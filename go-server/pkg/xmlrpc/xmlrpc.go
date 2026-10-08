package xmlrpc

import (
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/kolo/xmlrpc"
	"github.com/rogpeppe/go-charset/charset"
	_ "github.com/rogpeppe/go-charset/data"

	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/types"
)

func init() {
	xmlrpc.CharsetReader = func(label string, input io.Reader) (io.Reader, error) {
		return charset.NewReader(label, input)
	}
}

type EventHandler func(*types.CCUEvent)

// DeviceChangeHandler is called when the CCU reports a device as changed
// (e.g. new firmware) or deleted, with the interface name ("HmIP-RF").
type DeviceChangeHandler func(interfaceName, address string)

// maxRequestBodySize limits callbacks from the CCU. The largest regular
// payload is newDevices after init, which stays well below this.
const maxRequestBodySize = 8 << 20

// Timings for keeping the CCU registration alive. The CCU silently drops
// registrations (e.g. when rfd or the HmIP server restarts), so an interface
// that has been quiet for a minute is pinged. rfd, the HmIP server and the
// virtual devices all answer with a PONG event to the callback
// (HMIPServer.jar AccessPointUtil.sendPong, VirtualDeviceHandlerRega); if
// none arrives within pongTimeout, the server registers again. A lost
// registration is noticed after about 75 seconds instead of minutes.
const (
	defaultCheckInterval  = 5 * time.Second
	defaultPingAfter      = 1 * time.Minute
	defaultPongTimeout    = 15 * time.Second
	defaultReinitAfter    = 6 * time.Minute
	defaultInitialBackoff = 5 * time.Second
	defaultMaxBackoff     = 5 * time.Minute
)

type Server struct {
	cfg          *config.Config
	httpServer   *http.Server
	eventHandler EventHandler
	deviceChange DeviceChangeHandler
	clients      map[string]*xmlrpc.Client
	clientsMu    sync.Mutex

	lastSeen   map[string]time.Time // interfaceID -> last callback from the CCU
	lastSeenMu sync.Mutex

	registrations sync.WaitGroup

	known knownDevices

	checkInterval  time.Duration
	pingAfter      time.Duration
	pongTimeout    time.Duration
	reinitAfter    time.Duration
	initialBackoff time.Duration
	maxBackoff     time.Duration
}

type methodCall struct {
	XMLName    xml.Name `xml:"methodCall"`
	MethodName string   `xml:"methodName"`
	Params     params   `xml:"params"`
}

type params struct {
	Param []param `xml:"param"`
}

type param struct {
	Value value `xml:"value"`
}

type value struct {
	Array    *array       `xml:"array,omitempty"`
	Struct   *structValue `xml:"struct,omitempty"`
	String   *string      `xml:"string,omitempty"`
	Int      *int         `xml:"int,omitempty"`
	I4       *int         `xml:"i4,omitempty"`
	I8       *int64       `xml:"i8,omitempty"`
	DateTime *string      `xml:"dateTime.iso8601,omitempty"`
	Base64   *string      `xml:"base64,omitempty"`
	Double   *float64     `xml:"double,omitempty"`
	Boolean  *int         `xml:"boolean,omitempty"`
	Text     string       `xml:",chardata"` // Fallback for plain text content
}

type array struct {
	Data data `xml:"data"`
}

type data struct {
	Value []value `xml:"value"`
}

type structValue struct {
	Member []member `xml:"member"`
}

type member struct {
	Name  string `xml:"name"`
	Value value  `xml:"value"`
}

func NewServer(cfg *config.Config, eventHandler EventHandler) *Server {
	return &Server{
		cfg:          cfg,
		eventHandler: eventHandler,
		clients:      make(map[string]*xmlrpc.Client),
		lastSeen:     make(map[string]time.Time),

		checkInterval:  defaultCheckInterval,
		pingAfter:      defaultPingAfter,
		pongTimeout:    defaultPongTimeout,
		reinitAfter:    defaultReinitAfter,
		initialBackoff: defaultInitialBackoff,
		maxBackoff:     defaultMaxBackoff,
	}
}

// SetDeviceChangeHandler registers a handler for updateDevice and
// deleteDevices calls of the CCU.
func (s *Server) SetDeviceChangeHandler(handler DeviceChangeHandler) {
	s.deviceChange = handler
}

func (s *Server) Start(ctx context.Context) error {
	bindHost := "0.0.0.0"
	if s.cfg.CallbackHost == "127.0.0.1" || s.cfg.CallbackHost == "localhost" {
		bindHost = "127.0.0.1"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleXMLRPC)

	s.httpServer = &http.Server{
		Addr:              fmt.Sprintf("%s:%d", bindHost, s.cfg.RPCServerPort),
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	// Bind before calling init: the CCU calls back (listDevices, newDevices)
	// right away and would fail if the port weren't open yet.
	listener, err := net.Listen("tcp", s.httpServer.Addr)
	if err != nil {
		return err
	}

	logger.Debugf("✅ RPC Server created on %s:%d", bindHost, s.cfg.RPCServerPort)

	s.startRegistration(ctx, "BidCos-RF", s.cfg.RPCPort, "")
	s.startRegistration(ctx, "HmIP-RF", s.cfg.HmIPPort, "")
	if s.cfg.WiredPort > 0 {
		s.startRegistration(ctx, "BidCos-Wired", s.cfg.WiredPort, "")
	}
	// Heating groups (INT000000x) send their values through the HMServer's
	// virtual devices, which ReGa registers at /groups as well
	// (InterfacesList.xml)
	if s.cfg.VirtualDevicesPort > 0 {
		s.startRegistration(ctx, "VirtualDevices", s.cfg.VirtualDevicesPort, "/groups")
	}

	logger.Info("✅ RPC Server started and listening for callbacks from CCU")
	logger.Info(fmt.Sprintf("   CCU will send events to: %s", s.callbackURL()))

	if err := s.httpServer.Serve(listener); err != http.ErrServerClosed {
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

func (s *Server) callbackURL() string {
	return fmt.Sprintf("http://%s:%d", s.cfg.CallbackHost, s.cfg.RPCServerPort)
}

// Unregister removes the callback registrations from the CCU. The context
// passed to Start must be cancelled first, so the registration loops stop and
// can't re-register afterwards.
func (s *Server) Unregister(ctx context.Context) error {
	done := make(chan struct{})
	go func() {
		s.registrations.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-ctx.Done():
		return ctx.Err()
	}

	s.clientsMu.Lock()
	clients := make(map[string]*xmlrpc.Client, len(s.clients))
	for name, client := range s.clients {
		clients[name] = client
	}
	s.clientsMu.Unlock()

	// The CCU identifies a registration by its callback URL; init(url, "")
	// removes it. An empty URL would not match any registration.
	callbackURL := s.callbackURL()

	// All at once and no longer than the context allows: one call to a CCU
	// that doesn't answer takes up to 35 s (dial and answer timeout), one
	// after the other they held up the shutdown for minutes.
	var wg sync.WaitGroup
	for interfaceName, client := range clients {
		wg.Add(1)
		go func(interfaceName string, client *xmlrpc.Client) {
			defer wg.Done()
			interfaceID := interfaceIDFor(interfaceName)
			logger.Info("📤 Unregistering", interfaceID, "...")
			var result interface{}
			if err := client.Call("init", []interface{}{callbackURL, ""}, &result); err != nil {
				logger.Error(fmt.Sprintf("❌ Failed to unregister %s:", interfaceName), err)
			} else {
				logger.Info(fmt.Sprintf("✅ Unregistered %s", interfaceID))
			}
		}(interfaceName, client)
	}
	unregistered := make(chan struct{})
	go func() {
		wg.Wait()
		close(unregistered)
	}()
	select {
	case <-unregistered:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func interfaceIDFor(interfaceName string) string {
	return fmt.Sprintf("websocket-server-%s", interfaceName)
}

func (s *Server) newCCUClient(interfaceName string, port int, path string) (*xmlrpc.Client, error) {
	url := fmt.Sprintf("http://%s:%d%s", s.cfg.CCUHost, port, path)

	// Without timeouts a hanging CCU would block the registration loop forever.
	var transport http.RoundTripper = &http.Transport{
		DialContext:           (&net.Dialer{Timeout: 5 * time.Second}).DialContext,
		ResponseHeaderTimeout: 30 * time.Second,
	}

	if s.cfg.CCUUser != "" && s.cfg.CCUPass != "" {
		logger.Debugf("🔑 Using basic auth for port %d", port)
		transport = &basicAuthTransport{
			username: s.cfg.CCUUser,
			password: s.cfg.CCUPass,
			base:     transport,
		}
	}

	client, err := xmlrpc.NewClient(url, transport)
	if err != nil {
		return nil, err
	}

	s.clientsMu.Lock()
	s.clients[interfaceName] = client
	s.clientsMu.Unlock()

	return client, nil
}

func (s *Server) startRegistration(ctx context.Context, interfaceName string, port int, path string) {
	client, err := s.newCCUClient(interfaceName, port, path)
	if err != nil {
		logger.Error(fmt.Sprintf("❌ Failed to create XML-RPC client for %s:", interfaceName), err)
		return
	}

	s.registrations.Add(1)
	go func() {
		defer s.registrations.Done()
		s.maintainRegistration(ctx, client, interfaceName, port)
	}()
}

// maintainRegistration registers the callback with init, retrying with
// backoff while the interface isn't reachable (e.g. during CCU boot), and
// re-registers when the CCU stops sending callbacks.
func (s *Server) maintainRegistration(ctx context.Context, client *xmlrpc.Client, interfaceName string, port int) {
	interfaceID := interfaceIDFor(interfaceName)
	registered := false
	backoff := s.initialBackoff
	var pinged time.Time // when the unanswered ping was sent, zero if none

	for {
		wait := s.checkInterval

		idle := s.idleTime(interfaceID)
		// Any callback since the ping (the PONG or an event) answers it
		if !pinged.IsZero() && idle < time.Since(pinged) {
			pinged = time.Time{}
		}
		switch {
		case !registered || idle >= s.reinitAfter || (!pinged.IsZero() && time.Since(pinged) >= s.pongTimeout):
			if registered {
				logger.Info(fmt.Sprintf("🔄 No callbacks from %s for %s, re-registering", interfaceName, idle.Round(time.Second)))
			}
			pinged = time.Time{}
			if err := s.initInterface(client, interfaceName, port); err != nil {
				registered = false
				wait = backoff
				backoff = min(backoff*2, s.maxBackoff)
			} else {
				registered = true
				backoff = s.initialBackoff
				s.markSeen(interfaceID)
			}
		case pinged.IsZero() && idle >= s.pingAfter:
			// Taken before the call: the PONG may arrive before it returns
			sent := time.Now()
			var result interface{}
			if err := client.Call("ping", []interface{}{interfaceID}, &result); err != nil {
				// Not reachable (e.g. restarting): register again, with backoff
				logger.Debugf("Ping to %s failed: %v", interfaceName, err)
				registered = false
			} else {
				pinged = sent
			}
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
	}
}

func (s *Server) initInterface(client *xmlrpc.Client, interfaceName string, port int) error {
	callbackURL := s.callbackURL()
	interfaceID := interfaceIDFor(interfaceName)

	logger.Debugf("📞 Calling init on %s with callback URL: %s", interfaceName, callbackURL)

	var result interface{}
	if err := client.Call("init", []interface{}{callbackURL, interfaceID}, &result); err != nil {
		logger.Error(fmt.Sprintf("❌ Failed to initialize %s:", interfaceName), err.Error())
		logger.Error(fmt.Sprintf("   Make sure %s:%d is reachable", s.cfg.CCUHost, port))
		return err
	}

	logger.Info(fmt.Sprintf("✅ Connected to %s on %s:%d", interfaceName, s.cfg.CCUHost, port))
	logger.Debugf("   %s will now send events to %s with ID: %s", interfaceName, callbackURL, interfaceID)
	return nil
}

func (s *Server) markSeen(interfaceID string) {
	s.lastSeenMu.Lock()
	defer s.lastSeenMu.Unlock()
	s.lastSeen[interfaceID] = time.Now()
}

func (s *Server) idleTime(interfaceID string) time.Duration {
	s.lastSeenMu.Lock()
	defer s.lastSeenMu.Unlock()
	last, ok := s.lastSeen[interfaceID]
	if !ok {
		return 0
	}
	return time.Since(last)
}

type basicAuthTransport struct {
	username string
	password string
	base     http.RoundTripper
}

func (t *basicAuthTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// A RoundTripper must not modify the caller's request.
	req = req.Clone(req.Context())
	req.SetBasicAuth(t.username, t.password)
	return t.base.RoundTrip(req)
}

func (s *Server) handleXMLRPC(w http.ResponseWriter, r *http.Request) {
	logger.Debugf("📥 HTTP %s request from %s", r.Method, r.RemoteAddr)
	logger.Debugf("   URL: %s", r.URL.Path)
	logger.Debugf("   Content-Type: %s", r.Header.Get("Content-Type"))

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxRequestBodySize))
	if err != nil {
		logger.Error("Failed to read request body:", err)
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	logger.Debugf("   Request body: %s", body)

	var call methodCall
	decoder := xml.NewDecoder(bytes.NewReader(body))
	decoder.CharsetReader = func(label string, input io.Reader) (io.Reader, error) {
		return charset.NewReader(label, input)
	}
	if err := decoder.Decode(&call); err != nil {
		logger.Error("Failed to parse XML-RPC call:", err)
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	logger.Debugf("📞 Method call: %s", call.MethodName)

	var response string
	switch call.MethodName {
	case "system.multicall":
		response = s.handleSystemMulticall(&call)
	case "system.listMethods":
		response = s.handleSystemListMethods()
	case "event":
		response = s.handleEvent(&call)
	case "updateDevice", "deleteDevices":
		s.dispatchDeviceChange(call.MethodName, call.Params.Param)
		response = s.serializeMethodResponse("")
	case "newDevices":
		s.handleNewDevices(call.Params.Param)
		response = s.serializeMethodResponse("")
	case "listDevices":
		response = s.handleListDevices(&call)
	case "init":
		response = s.handleInit(&call)
	default:
		logger.Debugf("   Unknown method: %s", call.MethodName)
		response = s.serializeMethodResponse("")
	}

	w.Header().Set("Content-Type", "text/xml")
	if _, err := io.WriteString(w, response); err != nil {
		logger.Debug("Failed to write XML-RPC response:", err)
	}
}

func (s *Server) handleInit(call *methodCall) string {
	logger.Debug("📞 init() called by CCU")

	if len(call.Params.Param) >= 2 {
		callbackURL := ""
		interfaceID := ""

		if call.Params.Param[0].Value.String != nil {
			callbackURL = *call.Params.Param[0].Value.String
		}
		if call.Params.Param[1].Value.String != nil {
			interfaceID = *call.Params.Param[1].Value.String
		}

		logger.Debugf("   Callback URL: %s", callbackURL)
		logger.Debugf("   Interface ID: %s", interfaceID)

		if callbackURL == "" && interfaceID == "" {
			logger.Debug("   Deregistration request (empty params)")
		} else {
			logger.Debugf("   ✅ Registered interface '%s' with callback '%s'", interfaceID, callbackURL)
		}
	}

	return s.serializeMethodResponse("")
}

func (s *Server) handleSystemMulticall(call *methodCall) string {
	logger.Debug("📨 system.multicall received from CCU")

	if len(call.Params.Param) == 0 {
		logger.Debug("   Empty multicall, no events")
		return s.serializeMethodResponse("")
	}

	if call.Params.Param[0].Value.Array == nil {
		logger.Debug("   No array in multicall")
		return s.serializeMethodResponse("")
	}

	calls := call.Params.Param[0].Value.Array.Data.Value
	logger.Debugf("   Processing %d events from CCU", len(calls))

	for i, callValue := range calls {
		if callValue.Struct == nil {
			logger.Debugf("   Event %d: No struct", i+1)
			continue
		}

		var methodName string
		var params []interface{}
		var rawParams []param

		for _, m := range callValue.Struct.Member {
			if m.Name == "methodName" {
				if m.Value.String != nil {
					methodName = *m.Value.String
				} else if m.Value.Text != "" {
					methodName = m.Value.Text
				}
			} else if m.Name == "params" && m.Value.Array != nil {
				for _, p := range m.Value.Array.Data.Value {
					params = append(params, s.extractValue(&p))
					rawParams = append(rawParams, param{Value: p})
				}
			}
		}

		switch methodName {
		case "event":
			logger.Debugf("   Event %d", i+1)
			s.dispatchEvent(params)
		case "updateDevice", "deleteDevices":
			s.dispatchDeviceChange(methodName, rawParams)
		case "newDevices":
			s.handleNewDevices(rawParams)
		}
	}

	return s.serializeMethodResponse("")
}

// handleEvent handles a direct event call, which the CCU uses instead of
// system.multicall for single events on some interfaces.
func (s *Server) handleEvent(call *methodCall) string {
	params := make([]interface{}, 0, len(call.Params.Param))
	for i := range call.Params.Param {
		params = append(params, s.extractValue(&call.Params.Param[i].Value))
	}
	s.dispatchEvent(params)
	return s.serializeMethodResponse("")
}

// dispatchEvent takes the params of an event call:
// (interfaceID, address, datapoint, value).
func (s *Server) dispatchEvent(params []interface{}) {
	if len(params) < 4 {
		logger.Debugf("   Ignoring event with %d params", len(params))
		return
	}

	interfaceID := fmt.Sprint(params[0])
	address := fmt.Sprint(params[1])
	datapoint := fmt.Sprint(params[2])
	value := params[3]

	s.markSeen(interfaceID)

	logger.Debugf("   ✅ Event: %s | %s | %s = %v", interfaceID, address, datapoint, value)
	// The event names the interface (HmIP-RF), not this server's callback id
	s.handleCCUEvent(strings.TrimPrefix(interfaceID, "websocket-server-"), address, datapoint, value)
}

// dispatchDeviceChange handles updateDevice(interfaceID, address, hint) and
// deleteDevices(interfaceID, addresses).
func (s *Server) dispatchDeviceChange(method string, params []param) {
	if len(params) < 2 {
		return
	}
	interfaceID, _ := s.extractValue(&params[0].Value).(string)
	s.markSeen(interfaceID)
	interfaceName := strings.TrimPrefix(interfaceID, "websocket-server-")

	var addresses []string
	if method == "updateDevice" {
		if address, ok := s.extractValue(&params[1].Value).(string); ok {
			addresses = append(addresses, address)
		}
	} else if params[1].Value.Array != nil {
		for i := range params[1].Value.Array.Data.Value {
			if address, ok := s.extractValue(&params[1].Value.Array.Data.Value[i]).(string); ok {
				addresses = append(addresses, address)
			}
		}
	}

	if method == "deleteDevices" {
		s.known.remove(interfaceID, addresses)
	}
	for _, address := range addresses {
		logger.Debugf("   🔄 %s: %s %s", method, interfaceName, address)
		if s.deviceChange != nil {
			s.deviceChange(interfaceName, address)
		}
	}
}

func (s *Server) handleSystemListMethods() string {
	logger.Debug("📋 system.listMethods called by CCU")
	methods := []string{"system.listMethods", "system.multicall", "listDevices", "newDevices", "init", "event", "updateDevice", "deleteDevices"}
	logger.Debugf("   Returning methods: %v", methods)
	return s.serializeArrayResponse(methods)
}

func (s *Server) handleListDevices(call *methodCall) string {
	logger.Debug("📱 listDevices called by CCU")
	id := ""
	if len(call.Params.Param) > 0 {
		id, _ = s.extractValue(&call.Params.Param[0].Value).(string)
		s.markSeen(id)
	}
	return s.known.response(id)
}

// handleNewDevices notes the devices the interface reported, so the next
// init doesn't send them again (knownDevices). The descriptions themselves
// are read when needed (ccurpc).
func (s *Server) handleNewDevices(params []param) {
	interfaceID, versions := newDeviceVersions(params)
	if interfaceID == "" {
		return
	}
	s.markSeen(interfaceID)
	logger.Debugf("📱 newDevices: %d from %s", len(versions), interfaceID)
	s.known.add(interfaceID, versions)
}

func (s *Server) extractValue(v *value) interface{} {
	if v.String != nil {
		return *v.String
	}
	if v.Int != nil {
		return *v.Int
	}
	if v.I4 != nil {
		return *v.I4
	}
	if v.I8 != nil {
		return *v.I8
	}
	if v.Double != nil {
		return *v.Double
	}
	if v.Boolean != nil {
		return *v.Boolean != 0
	}
	if v.DateTime != nil {
		return *v.DateTime
	}
	if v.Base64 != nil {
		return *v.Base64
	}
	if v.Array != nil || v.Struct != nil {
		// Not used in events; the chardata would only be the whitespace
		// between the child elements.
		return nil
	}
	if v.Text != "" {
		// An untyped <value> is a string per the XML-RPC spec.
		return v.Text
	}
	return nil
}

func (s *Server) serializeMethodResponse(result string) string {
	return fmt.Sprintf(`<?xml version="1.0"?>
<methodResponse>
<params>
<param>
<value><string>%s</string></value>
</param>
</params>
</methodResponse>`, result)
}

func (s *Server) serializeArrayResponse(items []string) string {
	var arrayItems bytes.Buffer
	for _, item := range items {
		arrayItems.WriteString(fmt.Sprintf("<value><string>%s</string></value>", item))
	}

	return fmt.Sprintf(`<?xml version="1.0"?>
<methodResponse>
<params>
<param>
<value>
<array>
<data>
%s
</data>
</array>
</value>
</param>
</params>
</methodResponse>`, arrayItems.String())
}

func (s *Server) handleCCUEvent(interfaceName, address, datapoint string, value interface{}) {
	logger.Debugf("🔔 Processing CCU Event: %s | %s.%s = %v", interfaceName, address, datapoint, value)

	event := types.NewCCUEvent(interfaceName, address, datapoint, value)

	// Called synchronously so events reach clients in the order the CCU sent
	// them. The handler must not block (rule notifications are queued,
	// rules.Queue): the CCU waits for the answer before its next event.
	s.eventHandler(event)

	logger.Debug("   📤 Event sent to WebSocket handler")
}
