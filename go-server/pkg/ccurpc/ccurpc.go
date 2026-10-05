// Package ccurpc is an XML-RPC client for the CCU's device interfaces
// (BidCos-RF, HmIP-RF, VirtualDevices): device lists, paramset descriptions
// and paramsets. ReGa only knows names, rooms and current values; everything
// about what a device can do comes from here.
package ccurpc

import (
	"bytes"
	"errors"
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
	// slow: the same interfaces without the 30 s answer timeout, for
	// updateFirmware, which rfd answers only after the whole transfer
	// (RFDevice firmware update, minutes; ic_ifacecmd.cgi waits for it)
	slow map[string]caller

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
	interfaces := []Interface{
		{Name: "BidCos-RF", Port: cfg.RPCPort},
		{Name: "HmIP-RF", Port: cfg.HmIPPort},
		{Name: "VirtualDevices", Port: cfg.VirtualDevicesPort, Path: "/groups"},
	}
	// hs485d only runs with a Wired gateway (RS485 bus)
	if cfg.WiredPort > 0 {
		interfaces = append(interfaces, Interface{Name: "BidCos-Wired", Port: cfg.WiredPort})
	}
	return interfaces
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
	var slowTransport http.RoundTripper = &http.Transport{
		DialContext:           (&net.Dialer{Timeout: 5 * time.Second}).DialContext,
		ResponseHeaderTimeout: firmwareUpdateTimeout,
	}
	if cfg.CCUUser != "" && cfg.CCUPass != "" {
		slowTransport = &basicAuthTransport{username: cfg.CCUUser, password: cfg.CCUPass, base: slowTransport}
	}
	slowTransport = &untypedValueTransport{base: slowTransport}

	callers := map[string]caller{}
	slow := map[string]caller{}
	for _, iface := range Interfaces(cfg) {
		url := fmt.Sprintf("http://%s:%d%s", cfg.CCUHost, iface.Port, iface.Path)
		client, err := xmlrpc.NewClient(url, transport)
		if err != nil {
			return nil, err
		}
		callers[iface.Name] = client
		if slowClient, err := xmlrpc.NewClient(url, slowTransport); err == nil {
			slow[iface.Name] = slowClient
		}
	}
	c := newClient(callers)
	c.slow = slow
	return c, nil
}

// How long a BidCos device firmware update may take (transfer and flash)
const firmwareUpdateTimeout = 20 * time.Minute

// callSlow is call without the answer timeout (see Client.slow)
func (c *Client) callSlow(iface, method string, args []interface{}, reply interface{}) error {
	rpc, ok := c.slow[iface]
	if !ok {
		return c.call(iface, method, args, reply)
	}
	if err := rpc.Call(method, args, reply); err != nil {
		return fmt.Errorf("%s %s: %w", iface, method, err)
	}
	return nil
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

// Errors of a device firmware update, as ic_ifacecmd.cgi (cmd_firmware_update)
// tells them apart
var (
	// ErrDeviceUnreachable: the device did not answer (fault -1, or -10
	// "Transmission Pending" for BidCos); it has to be in radio range and,
	// if it sleeps, woken with its system key (fwUpdatePressSystemKey)
	ErrDeviceUnreachable = errors.New("the device is not reachable")
	// ErrDutyCycleHigh: the CCU's radio module used 80 % or more of its
	// transmit time (isDutyCycleOK4DevUpdate in webui.js)
	ErrDutyCycleHigh = errors.New("the duty cycle of the CCU is too high")
)

// dutyCycleWarningLevel is where the WebUI refuses device updates
// (dcWarningLevel in isDutyCycleOK4DevUpdate)
const dutyCycleWarningLevel = 80

// isHmIPInterface: HomeMatic IP devices update with installFirmware, the
// others with updateFirmware (cmd_firmware_update)
func isHmIPInterface(iface string) bool {
	return iface == "HmIP-RF" || iface == "HmIP-Wired"
}

// InstallFirmware starts the update of a device to the firmware the CCU
// has for it, as the WebUI's update button does (FirmwareUpdate in
// webui.js, cmd_firmware_update in ic_ifacecmd.cgi): HomeMatic IP devices
// with installFirmware once it is delivered (READY_FOR_UPDATE,
// DO_UPDATE_PENDING, LIVE_NEW_FIRMWARE_AVAILABLE), BidCos devices with
// updateFirmware, which transfers and installs it in one go. Over radio it
// first checks the CCU's duty cycle; wired HmIP devices skip that.
func (c *Client) InstallFirmware(iface, address string) error {
	if !addressRegex.MatchString(address) || strings.Contains(address, ":") {
		return ErrInvalidAddress
	}
	device, err := c.GetDeviceDescription(iface, address)
	if err != nil {
		return err
	}
	if !strings.HasPrefix(device.Type, "HmIPW-") && c.dutyCycleHigh() {
		return ErrDutyCycleHigh
	}
	var reply interface{}
	if isHmIPInterface(iface) {
		// Starts the update and answers at once
		err = c.call(iface, "installFirmware", []interface{}{address}, &reply)
	} else {
		// Transfers and flashes before it answers
		err = c.callSlow(iface, "updateFirmware", []interface{}{address}, &reply)
	}
	switch faultCode(err) {
	case -1, -9, -10:
		// -9: out of range (rfd)
		return ErrDeviceUnreachable
	case -8:
		// rfd: not enough duty cycle left for the transfer
		return ErrDutyCycleHigh
	}
	if err != nil {
		return err
	}
	if !replyOK(reply) {
		return fmt.Errorf("the CCU did not start the update")
	}
	c.Forget(iface, address)
	return nil
}

// replyOK: installFirmware answers a bool, updateFirmware one per device
func replyOK(reply interface{}) bool {
	switch v := reply.(type) {
	case bool:
		return v
	case []interface{}:
		for _, item := range v {
			if ok, isBool := item.(bool); isBool && !ok {
				return false
			}
		}
	}
	return true
}

// dutyCycleHigh: the CCU's own radio module (type CCU2) used too much of
// its transmit time. OpenCCU asks HmIP-RF when there is no BidCos-RF
// (0068-WebUI-Fix-isDutyCycleOK4DevUpdate); without either there is
// nothing to check.
func (c *Client) dutyCycleHigh() bool {
	modules, err := c.ListBidcosInterfaces("BidCos-RF")
	if err != nil {
		if modules, err = c.ListBidcosInterfaces("HmIP-RF"); err != nil {
			return false
		}
	}
	for _, module := range modules {
		if module.Type == "CCU2" {
			return module.DutyCycle >= dutyCycleWarningLevel
		}
	}
	return false
}

// RefreshDeployedDeviceFirmwareList lets an interface process read the
// device firmware under /etc/config/firmware again, as the WebUI's device
// firmware page does after adding or deleting one (AvailableFirmware.ftl)
func (c *Client) RefreshDeployedDeviceFirmwareList(iface string) error {
	var reply interface{}
	return c.call(iface, "refreshDeployedDeviceFirmwareList", nil, &reply)
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
