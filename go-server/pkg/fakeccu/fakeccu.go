// Package fakeccu is a stand-in for a CCU in tests: it answers the ReGa
// scripts of the add-on, the XML-RPC interfaces and the WebUI login from a
// Fixture, takes writes in memory and sends events back to the registered
// callbacks, like the real CCU. Go tests and Playwright run against it
// without hardware.
package fakeccu

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"regexp"
	"sync"
	"time"

	"ccu-addon-mui-server/pkg/rega"
)

// Interface names and the order their ports are assigned in
var interfaceNames = []string{"BidCos-RF", "HmIP-RF", "VirtualDevices", "BidCos-Wired"}

type CCU struct {
	// When the fake started: the time stamp of its maintenance values
	Started time.Time
	mu      sync.Mutex
	// Lite makes it an openccu-lite: no ReGa, and occulited's APIs on the
	// WebUI port instead of the WebUI (occulited.go)
	Lite bool
	lite *liteStore
	// The event stream's messages and who follows it (occulited.go)
	liteEvents  []liteEvent
	liteStreams map[chan liteEvent]bool
	liteGroups  []*liteGroup
	// The metadata change stream's events and who follows it
	metaEvents  []metaEvent
	metaStreams map[chan metaEvent]bool
	liteGroupID int
	// ConfigDir is the fake /etc/config, for the security settings
	// flag files (sshEnabled, authEnabled, httpsRedirectEnabled)
	ConfigDir string
	// The SSH password and the system security key set
	SSHPassword string
	// The SNMP user CCU.setSNMPEnabled set up, "" while off
	SNMPUser    string
	SecurityKey string
	// GroupsFile is where the fake HMServer keeps the heating groups
	// (groups.gson); empty: none
	GroupsFile string
	// FirmwareDownloadFile is where CCU.downloadFirmware stores the
	// downloaded update (FakeFirmwareDownload); empty: the download fails
	FirmwareDownloadFile string
	// FirmwareStagedLink, if set, is linked to the checked update like
	// /usr/local/.firmwareUpdate (action_firmware_upload: ln -sfn)
	FirmwareStagedLink string
	// FirmwareUpdateDelay: how long updateFirmware takes to answer, as
	// rfd's does after the whole transfer
	FirmwareUpdateDelay time.Duration
	groupMetadata       map[string]string
	fixture             *Fixture
	// original is the fixture as loaded, for Reset
	original []byte

	// callbacks by interface, then by interface id (from init)
	callbacks map[string]map[string]string
	events    chan callbackEvent

	scripts []script

	servers []*http.Server
	// Ports after Start
	RegaPort       int
	WebUIPort      int
	InterfacePorts map[string]int

	// calls counts XML-RPC calls by "interface method"
	calls map[string]int

	// installModeUntil by interface
	installModeUntil map[string]time.Time
	// metadata set with setMetadata, by interface and "object/dataID"
	metadata map[string]map[string]any
	// Pairing by serial number: devices with a foreign security key (serial
	// starting with "KEQ") need the temporary key set; the device that
	// failed last (getKeyMismatchDevice)
	tempKey, keyMismatch string
	// The user logged in automatically (UsersDefaultLogin), 0 for none
	autoLoginUser    int64
	factoryResetDone bool
	// The last HmIP whitelist (setInstallModeWithWhitelist)
	Whitelist []map[string]any
	// Time modules created by save_program, for their ids
	timeModules int
	// The location set with set_location (system.Latitude/Longitude)
	latitude, longitude string
	// The system protocol is cleared (clear_history)
	historyCleared bool
	// Log levels of the logic layer (set_log_level) and the interfaces
	// (logLevel)
	regaLogLevel int
	// The backup restore through the WebUI (fileupload.ccc, cp_security.cgi)
	tempUpload, uploadedBackup, checkedBackup, restoredBackup string
	// The firmware update through the WebUI (cp_maintenance.cgi)
	stagedFirmware, installedFirmware string
	// Add-ons installed through the WebUI (cp_software.cgi)
	newAddon        string
	installedAddons []string
	rebooted        bool
	rpcLogLevels    map[string]int
}

// CallCount returns how often an XML-RPC method was called, e.g.
// CallCount("HmIP-RF init").
func (c *CCU) CallCount(call string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.calls[call]
}

type callbackEvent struct {
	url, interfaceID, address, datapoint string
	value                                any
}

// script matches a ReGa script built from one of the add-on's templates
// and extracts the values substituted for its placeholders.
type script struct {
	name   string
	regex  *regexp.Regexp
	fields []string
}

var placeholderRegex = regexp.MustCompile(`\\\{\\\{([A-Z_]+)\\\}\\\}`)

func compileScripts() []script {
	var scripts []script
	for name, template := range rega.Scripts() {
		quoted := regexp.QuoteMeta(template)
		var fields []string
		pattern := placeholderRegex.ReplaceAllStringFunc(quoted, func(m string) string {
			fields = append(fields, placeholderRegex.FindStringSubmatch(m)[1])
			return `(.*?)`
		})
		scripts = append(scripts, script{name: name, regex: regexp.MustCompile(`(?s)^` + pattern + `$`), fields: fields})
	}
	return scripts
}

func New(fixture *Fixture) *CCU {
	if fixture.Interfaces == nil {
		fixture.Interfaces = map[string]*InterfaceData{}
	}
	original, _ := json.Marshal(fixture)
	return &CCU{
		Started:          time.Now(),
		fixture:          fixture,
		original:         original,
		callbacks:        map[string]map[string]string{},
		events:           make(chan callbackEvent, 1024),
		scripts:          compileScripts(),
		InterfacePorts:   map[string]int{},
		calls:            map[string]int{},
		installModeUntil: map[string]time.Time{},
		metadata:         map[string]map[string]any{},
		regaLogLevel:     2,
	}
}

// Start listens on free ports of host (e.g. "127.0.0.1") unless ports are
// given: rega, webui, then one per interface (BidCos-RF, HmIP-RF,
// VirtualDevices).
func (c *CCU) Start(host string, ports ...int) error {
	port := func(i int) int {
		if i < len(ports) {
			return ports[i]
		}
		return 0
	}
	listen := func(i int, handler http.Handler) (int, error) {
		listener, err := net.Listen("tcp", fmt.Sprintf("%s:%d", host, port(i)))
		if err != nil {
			return 0, err
		}
		server := &http.Server{Handler: handler, ReadHeaderTimeout: 5 * time.Second}
		c.servers = append(c.servers, server)
		go func() { _ = server.Serve(listener) }()
		return listener.Addr().(*net.TCPAddr).Port, nil
	}

	var err error
	if c.RegaPort, err = listen(0, http.HandlerFunc(c.handleRega)); err != nil {
		return err
	}
	if c.WebUIPort, err = listen(1, http.HandlerFunc(c.handleWebUI)); err != nil {
		return err
	}
	for i, iface := range interfaceNames {
		iface := iface
		p, err := listen(2+i, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { c.handleXMLRPC(iface, w, r) }))
		if err != nil {
			return err
		}
		c.InterfacePorts[iface] = p
	}
	go c.sendEvents()
	return nil
}

func (c *CCU) Close() {
	for _, server := range c.servers {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		_ = server.Shutdown(ctx)
		cancel()
	}
}
