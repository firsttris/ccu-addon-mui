// Package ccurpc is an XML-RPC client for the CCU's device interfaces
// (BidCos-RF, HmIP-RF, VirtualDevices): device lists, paramset descriptions
// and paramsets. ReGa only knows names, rooms and current values; everything
// about what a device can do comes from here.
package ccurpc

import (
	"bytes"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/kolo/xmlrpc"
	"github.com/rogpeppe/go-charset/charset"
	_ "github.com/rogpeppe/go-charset/data"

	"ccu-addon-mui-server/pkg/config"
)

func init() {
	// The CCU answers in ISO-8859-1
	xmlrpc.CharsetReader = func(label string, input io.Reader) (io.Reader, error) {
		return charset.NewReader(label, input)
	}
}

// Paramset keys
const (
	ParamsetValues = "VALUES"
	ParamsetMaster = "MASTER"
)

var (
	addressRegex = regexp.MustCompile(`^[A-Za-z0-9_-]{1,40}(:[0-9]{1,3})?$`)

	ErrUnknownInterface = fmt.Errorf("unknown interface")
	ErrInvalidAddress   = fmt.Errorf("invalid address")
	ErrInvalidParamset  = fmt.Errorf("invalid paramset key")
)

// caller is the part of *xmlrpc.Client used here, replaceable in tests.
type caller interface {
	Call(method string, args interface{}, reply interface{}) error
}

type Client struct {
	interfaces map[string]caller

	mu sync.Mutex
	// Device descriptions by interface and address; they only change with
	// a firmware update or re-pairing (see Forget).
	devices map[string]DeviceDescription
	// Paramset descriptions by interface, device type, channel, firmware
	// version and paramset key: they are the same for all devices of a type.
	paramsetDescriptions map[string]ParamsetDescription
}

// Interface describes a device interface of the CCU.
type Interface struct {
	Name string
	Port int
	Path string
}

// Interfaces returns the interfaces the server talks to.
func Interfaces(cfg *config.Config) []Interface {
	return []Interface{
		{Name: "BidCos-RF", Port: cfg.RPCPort},
		{Name: "HmIP-RF", Port: cfg.HmIPPort},
		{Name: "VirtualDevices", Port: cfg.VirtualDevicesPort, Path: "/groups"},
	}
}

func New(cfg *config.Config) (*Client, error) {
	var transport http.RoundTripper = &http.Transport{
		DialContext:           (&net.Dialer{Timeout: 5 * time.Second}).DialContext,
		ResponseHeaderTimeout: 30 * time.Second,
	}
	if cfg.CCUUser != "" && cfg.CCUPass != "" {
		transport = &basicAuthTransport{username: cfg.CCUUser, password: cfg.CCUPass, base: transport}
	}
	transport = &untypedValueTransport{base: transport}

	callers := map[string]caller{}
	for _, iface := range Interfaces(cfg) {
		client, err := xmlrpc.NewClient(fmt.Sprintf("http://%s:%d%s", cfg.CCUHost, iface.Port, iface.Path), transport)
		if err != nil {
			return nil, err
		}
		callers[iface.Name] = client
	}
	return newClient(callers), nil
}

// InterfaceNames returns the names of the interfaces, sorted.
func (c *Client) InterfaceNames() []string {
	names := make([]string, 0, len(c.interfaces))
	for name := range c.interfaces {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func newClient(callers map[string]caller) *Client {
	return &Client{
		interfaces:           callers,
		devices:              map[string]DeviceDescription{},
		paramsetDescriptions: map[string]ParamsetDescription{},
	}
}

func (c *Client) call(iface, method string, args []interface{}, reply interface{}) error {
	rpc, ok := c.interfaces[iface]
	if !ok {
		return ErrUnknownInterface
	}
	if err := rpc.Call(method, args, reply); err != nil {
		return fmt.Errorf("%s %s: %w", iface, method, err)
	}
	return nil
}

func validate(address, paramsetKey string) error {
	if !addressRegex.MatchString(address) {
		return ErrInvalidAddress
	}
	if paramsetKey != ParamsetValues && paramsetKey != ParamsetMaster {
		return ErrInvalidParamset
	}
	return nil
}

// InstallFirmware starts the update of a HomeMatic IP device whose new
// firmware has been delivered (FIRMWARE_UPDATE_STATE READY_FOR_UPDATE).
func (c *Client) InstallFirmware(iface, address string) error {
	if !addressRegex.MatchString(address) {
		return ErrInvalidAddress
	}
	var reply interface{}
	if err := c.call(iface, "installFirmware", []interface{}{address}, &reply); err != nil {
		return err
	}
	if ok, isBool := reply.(bool); isBool && !ok {
		return fmt.Errorf("the CCU did not start the update")
	}
	c.Forget(iface, address)
	return nil
}

// CallRaw calls a method and returns the decoded reply as is, e.g. for
// exporting fixtures.
func (c *Client) CallRaw(iface, method string, args ...interface{}) (interface{}, error) {
	var reply interface{}
	err := c.call(iface, method, args, &reply)
	return reply, err
}

// ListDevices returns the descriptions of all devices and channels of an
// interface.
func (c *Client) ListDevices(iface string) ([]DeviceDescription, error) {
	var reply []interface{}
	if err := c.call(iface, "listDevices", nil, &reply); err != nil {
		return nil, err
	}
	devices := make([]DeviceDescription, 0, len(reply))
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, raw := range reply {
		if m, ok := raw.(map[string]interface{}); ok {
			device := parseDeviceDescription(m)
			devices = append(devices, device)
			c.devices[iface+"|"+device.Address] = device
		}
	}
	return devices, nil
}

// GetDeviceDescription returns the description of a device or channel.
func (c *Client) GetDeviceDescription(iface, address string) (DeviceDescription, error) {
	if !addressRegex.MatchString(address) {
		return DeviceDescription{}, ErrInvalidAddress
	}
	key := iface + "|" + address
	c.mu.Lock()
	device, ok := c.devices[key]
	c.mu.Unlock()
	if ok {
		return device, nil
	}

	var reply map[string]interface{}
	if err := c.call(iface, "getDeviceDescription", []interface{}{address}, &reply); err != nil {
		return DeviceDescription{}, err
	}
	device = parseDeviceDescription(reply)
	c.mu.Lock()
	c.devices[key] = device
	c.mu.Unlock()
	return device, nil
}

// Forget drops the cached descriptions of a device and its channels, e.g.
// after the CCU reported it as updated or deleted.
func (c *Client) Forget(iface, deviceAddress string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for key := range c.devices {
		address := strings.TrimPrefix(key, iface+"|")
		if address != key && (address == deviceAddress || strings.HasPrefix(address, deviceAddress+":")) {
			delete(c.devices, key)
		}
	}
}

// GetParamsetDescription describes the parameters of a paramset (VALUES or
// MASTER) of a device or channel.
func (c *Client) GetParamsetDescription(iface, address, paramsetKey string) (ParamsetDescription, error) {
	if err := validate(address, paramsetKey); err != nil {
		return nil, err
	}
	device, err := c.GetDeviceDescription(iface, address)
	if err != nil {
		return nil, err
	}

	// Channels of the same device type have the same descriptions
	_, channel, _ := strings.Cut(address, ":")
	deviceType := device.ParentType
	if deviceType == "" {
		deviceType = device.Type
	}
	cacheKey := strings.Join([]string{iface, deviceType, device.Type, channel, fmt.Sprint(device.Version), paramsetKey}, "|")

	c.mu.Lock()
	description, ok := c.paramsetDescriptions[cacheKey]
	c.mu.Unlock()
	if ok {
		return description, nil
	}

	var reply map[string]interface{}
	if err := c.call(iface, "getParamsetDescription", []interface{}{address, paramsetKey}, &reply); err != nil {
		return nil, err
	}
	description = parseParamsetDescription(reply)
	c.mu.Lock()
	c.paramsetDescriptions[cacheKey] = description
	c.mu.Unlock()
	return description, nil
}

// GetParamset returns the current values of a paramset.
func (c *Client) GetParamset(iface, address, paramsetKey string) (map[string]interface{}, error) {
	if err := validate(address, paramsetKey); err != nil {
		return nil, err
	}
	var reply map[string]interface{}
	if err := c.call(iface, "getParamset", []interface{}{address, paramsetKey}, &reply); err != nil {
		return nil, err
	}
	if reply == nil {
		reply = map[string]interface{}{}
	}
	return reply, nil
}

// untypedValueRegex matches a value without type element, which XML-RPC
// defines as string and the CCU sends a lot.
var untypedValueRegex = regexp.MustCompile(`<value>([^<]*)</value>`)

// untypedValueTransport wraps untyped values in <string>: kolo/xmlrpc fails
// to decode them into interface{} ("can't unmarshal interface to string").
type untypedValueTransport struct {
	base http.RoundTripper
}

func (t *untypedValueTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	resp, err := t.base.RoundTrip(req)
	if err != nil {
		return nil, err
	}
	body, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		return nil, err
	}
	body = untypedValueRegex.ReplaceAll(body, []byte("<value><string>$1</string></value>"))
	resp.Body = io.NopCloser(bytes.NewReader(body))
	resp.ContentLength = int64(len(body))
	return resp, nil
}

type basicAuthTransport struct {
	username string
	password string
	base     http.RoundTripper
}

func (t *basicAuthTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// A RoundTripper must not modify the caller's request.
	clone := req.Clone(req.Context())
	clone.SetBasicAuth(t.username, t.password)
	return t.base.RoundTrip(clone)
}
