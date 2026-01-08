package xmlrpc

import (
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"sync"

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

type Server struct {
	cfg          *config.Config
	httpServer   *http.Server
	eventHandler EventHandler
	clients      map[string]*xmlrpc.Client
	clientsMu    sync.Mutex
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
	Array   *array       `xml:"array,omitempty"`
	Struct  *structValue `xml:"struct,omitempty"`
	String  *string      `xml:"string,omitempty"`
	Int     *int         `xml:"int,omitempty"`
	I4      *int         `xml:"i4,omitempty"`
	Double  *float64     `xml:"double,omitempty"`
	Boolean *int         `xml:"boolean,omitempty"`
	Text    string       `xml:",chardata"` // Fallback for plain text content
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
	}
}

func (s *Server) Start(ctx context.Context) error {
	bindHost := "0.0.0.0"
	if s.cfg.CallbackHost == "127.0.0.1" || s.cfg.CallbackHost == "localhost" {
		bindHost = "127.0.0.1"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleXMLRPC)

	s.httpServer = &http.Server{
		Addr:    fmt.Sprintf("%s:%d", bindHost, s.cfg.RPCServerPort),
		Handler: mux,
	}

	logger.Debug(fmt.Sprintf("✅ RPC Server created on %s:%d", bindHost, s.cfg.RPCServerPort))

	go s.connectToCCU("BidCos-RF", s.cfg.RPCPort)
	go s.connectToCCU("HmIP-RF", s.cfg.HmIPPort)

	logger.Info("✅ RPC Server started and listening for callbacks from CCU")
	logger.Info(fmt.Sprintf("   CCU will send events to: http://%s:%d", s.cfg.CallbackHost, s.cfg.RPCServerPort))

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

func (s *Server) Unregister(ctx context.Context) error {
	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()

	for interfaceName, client := range s.clients {
		interfaceID := fmt.Sprintf("websocket-server-%s", interfaceName)
		logger.Info("📤 Unregistering", interfaceID, "...")

		var result interface{}
		if err := client.Call("init", []interface{}{"", ""}, &result); err != nil {
			logger.Error(fmt.Sprintf("❌ Failed to unregister %s:", interfaceName), err)
		} else {
			logger.Info(fmt.Sprintf("✅ Unregistered %s", interfaceID))
		}
	}

	return nil
}

func (s *Server) connectToCCU(interfaceName string, port int) {
	logger.Debug(fmt.Sprintf("🔌 Attempting to connect to %s at %s:%d...", interfaceName, s.cfg.CCUHost, port))

	url := fmt.Sprintf("http://%s:%d", s.cfg.CCUHost, port)

	var transport http.RoundTripper
	
	if s.cfg.CCUUser != "" && s.cfg.CCUPass != "" {
		logger.Debug(fmt.Sprintf("🔑 Using basic auth for port %d", port))
		transport = &basicAuthTransport{
			username: s.cfg.CCUUser,
			password: s.cfg.CCUPass,
		}
	}

	client, err := xmlrpc.NewClient(url, transport)
	if err != nil {
		logger.Error(fmt.Sprintf("❌ Failed to create XML-RPC client for %s:", interfaceName), err)
		return
	}

	s.clientsMu.Lock()
	s.clients[interfaceName] = client
	s.clientsMu.Unlock()

	callbackURL := fmt.Sprintf("http://%s:%d", s.cfg.CallbackHost, s.cfg.RPCServerPort)
	interfaceID := fmt.Sprintf("websocket-server-%s", interfaceName)

	logger.Debug(fmt.Sprintf("📞 Calling init on %s with callback URL: %s", interfaceName, callbackURL))

	var result interface{}
	if err := client.Call("init", []interface{}{callbackURL, interfaceID}, &result); err != nil {
		logger.Error(fmt.Sprintf("❌ Failed to initialize %s:", interfaceName), err.Error())
		logger.Error(fmt.Sprintf("   Make sure %s:%d is reachable", s.cfg.CCUHost, port))
		logger.Debug("   Full error:", err)
	} else {
		logger.Info(fmt.Sprintf("✅ Connected to %s on %s:%d", interfaceName, s.cfg.CCUHost, port))
		logger.Debug(fmt.Sprintf("   %s will now send events to %s with ID: %s", interfaceName, callbackURL, interfaceID))
	}
}

type basicAuthTransport struct {
	username string
	password string
}

func (t *basicAuthTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	req.SetBasicAuth(t.username, t.password)
	return http.DefaultTransport.RoundTrip(req)
}

func (s *Server) handleXMLRPC(w http.ResponseWriter, r *http.Request) {
	logger.Debug(fmt.Sprintf("📥 HTTP %s request from %s", r.Method, r.RemoteAddr))
	logger.Debug(fmt.Sprintf("   URL: %s", r.URL.Path))
	logger.Debug(fmt.Sprintf("   Content-Type: %s", r.Header.Get("Content-Type")))

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		logger.Error("Failed to read request body:", err)
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	logger.Debug(fmt.Sprintf("   Request body: %s", string(body)))

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

	logger.Debug(fmt.Sprintf("📞 Method call: %s", call.MethodName))

	var response string
	switch call.MethodName {
	case "system.multicall":
		response = s.handleSystemMulticall(&call)
	case "system.listMethods":
		response = s.handleSystemListMethods()
	case "listDevices":
		response = s.handleListDevices()
	case "init":
		response = s.handleInit(&call)
	default:
		logger.Debug(fmt.Sprintf("   Unknown method: %s", call.MethodName))
		response = s.serializeMethodResponse("")
	}

	w.Header().Set("Content-Type", "text/xml")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(response)))
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(response))
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
		
		logger.Debug(fmt.Sprintf("   Callback URL: %s", callbackURL))
		logger.Debug(fmt.Sprintf("   Interface ID: %s", interfaceID))
		
		if callbackURL == "" && interfaceID == "" {
			logger.Debug("   Deregistration request (empty params)")
		} else {
			logger.Debug(fmt.Sprintf("   ✅ Registered interface '%s' with callback '%s'", interfaceID, callbackURL))
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
	logger.Debug(fmt.Sprintf("   Processing %d events from CCU", len(calls)))

	for i, callValue := range calls {
		if callValue.Struct == nil {
			logger.Debug(fmt.Sprintf("   Event %d: No struct", i+1))
			continue
		}

		var methodName string
		var params []interface{}

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
				}
			}
		}

		if methodName == "event" && len(params) >= 4 {
			interfaceName := fmt.Sprint(params[0])
			address := fmt.Sprint(params[1])
			datapoint := fmt.Sprint(params[2])
			value := params[3]

			logger.Debug(fmt.Sprintf("   ✅ Event %d: %s | %s | %s = %v", i+1, interfaceName, address, datapoint, value))
			s.handleCCUEvent(interfaceName, address, datapoint, value)
		}
	}

	return s.serializeMethodResponse("")
}

func (s *Server) handleSystemListMethods() string {
	logger.Debug("📋 system.listMethods called by CCU")
	methods := []string{"system.listMethods", "system.multicall", "listDevices", "init", "event"}
	logger.Debug(fmt.Sprintf("   Returning methods: %v", methods))
	return s.serializeArrayResponse(methods)
}

func (s *Server) handleListDevices() string {
	logger.Debug("📱 listDevices called by CCU")
	logger.Debug("   Returning empty device list")
	return s.serializeArrayResponse([]string{})
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
	if v.Double != nil {
		return *v.Double
	}
	if v.Boolean != nil {
		return *v.Boolean != 0
	}
	if v.Text != "" {
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
	logger.Debug(fmt.Sprintf("🔔 Processing CCU Event: %s | %s.%s = %v", interfaceName, address, datapoint, value))

	event := types.NewCCUEvent(interfaceName, address, datapoint, value)
	
	go s.eventHandler(event)

	logger.Debug("   📤 Event sent to WebSocket handler")
}
