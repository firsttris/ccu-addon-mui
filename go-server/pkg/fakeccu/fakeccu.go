// Package fakeccu is a stand-in for a CCU in tests: it answers the ReGa
// scripts of the add-on, the XML-RPC interfaces and the WebUI login from a
// Fixture, takes writes in memory and sends events back to the registered
// callbacks, like the real CCU. Go tests and Playwright run against it
// without hardware.
package fakeccu

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"os"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"ccu-addon-mui-server/pkg/latin1"
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
	metadata map[string]map[string]interface{}
	// Pairing by serial number: devices with a foreign security key (serial
	// starting with "KEQ") need the temporary key set; the device that
	// failed last (getKeyMismatchDevice)
	tempKey, keyMismatch string
	// The user logged in automatically (UsersDefaultLogin), 0 for none
	autoLoginUser    int64
	factoryResetDone bool
	// The last HmIP whitelist (setInstallModeWithWhitelist)
	Whitelist []map[string]interface{}
	// Time modules created by save_program, for their ids
	timeModules int
	// Tile layouts by room, trade or favorite list id (ReGa metadata)
	layouts map[string]string
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
	value                                interface{}
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
		metadata:         map[string]map[string]interface{}{},
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

// --- ReGa -------------------------------------------------------------

func (c *CCU) handleRega(w http.ResponseWriter, r *http.Request) {
	if c.Lite {
		http.Error(w, "openccu-lite has no ReGa", http.StatusNotFound)
		return
	}
	// ReGa reads and writes ISO-8859-1 (see package latin1)
	body, _ := io.ReadAll(r.Body)
	// rega.ExecuteComplete: the script's last line writes the end marker
	endLine := "\nWriteLine(\"" + rega.EndMarker + "\");\n"
	script, complete := strings.CutSuffix(latin1.Decode(body), endLine)
	output, err := c.runScript(script)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if complete {
		output += rega.EndMarker + "\r\n"
	}
	// rega.exe appends its variables
	_, _ = w.Write(toLatin1(output + "<xml><exec>/rega.exe</exec></xml>"))
}

// FakeRegaBuild is the ReGaHss version the fake reports
const FakeRegaBuild = "R1.00.0388.0235"

func (c *CCU) runScript(body string) (string, error) {
	if strings.HasPrefix(body, "Write(\"Hello") {
		return "Hello from WebSocket Server", nil
	}
	for _, s := range c.scripts {
		m := s.regex.FindStringSubmatch(body)
		if m == nil {
			continue
		}
		values := map[string]string{}
		for i, field := range s.fields {
			if _, ok := values[field]; !ok {
				values[field] = m[i+1]
			}
		}
		c.mu.Lock()
		defer c.mu.Unlock()
		switch s.name {
		case "get_rooms":
			return writeGroups(c.fixture.Rooms), nil
		case "get_trades":
			return writeGroups(c.fixture.Trades), nil
		case "get_channels":
			return c.getChannels(values["OBJECT_ID"]), nil
		case "set_datapoint":
			return c.setDatapoint(values), nil
		case "get_device_health":
			return c.getDeviceHealth(), nil
		case "get_device_problems":
			return c.getDeviceProblems(), nil
		case "set_name":
			return c.setName(values["ADDRESS"], values["NAME"]), nil
		case "get_inbox":
			return c.getInbox(), nil
		case "setup_group_device":
			return c.setupGroupDevice(values), nil
		case "accept_device":
			for i, address := range c.fixture.Inbox {
				if address == values["ADDRESS"] {
					c.fixture.Inbox = append(c.fixture.Inbox[:i], c.fixture.Inbox[i+1:]...)
					return "OK", nil
				}
			}
			return "NOT_FOUND", nil
		case "get_sysvars":
			return c.getSysvars(), nil
		case "set_sysvar":
			id, _ := strconv.ParseInt(values["ID"], 10, 64)
			for i := range c.fixture.Sysvars {
				if sv := &c.fixture.Sysvars[i]; sv.ID == id {
					previous := formatValue(sv.Value)
					sv.Value = parseRegaValue(values["VALUE"])
					// Setting an alarm variable triggers the alarm again
					if sv.SubType == 6 && sv.Value == true {
						sv.AlarmCounter++
						sv.AlarmTime = "2026-01-15 10:00:00"
						sv.receipted = false
					}
					return "OK\t" + previous, nil
				}
			}
			return "NOT_FOUND", nil
		case "get_programs":
			var b strings.Builder
			for _, p := range c.fixture.Programs {
				fmt.Fprintf(&b, "P\t%d\t%t\t%t\t%t\t%t\t%s\n", p.ID, p.Active, p.Visible, !p.ReadOnly, p.Internal, p.Name)
			}
			return b.String(), nil
		case "program_action":
			id, _ := strconv.ParseInt(values["ID"], 10, 64)
			for i := range c.fixture.Programs {
				if p := &c.fixture.Programs[i]; p.ID == id {
					switch values["ACTION"] {
					case "run":
						p.Runs++
					case "on", "off":
						p.Active = values["ACTION"] == "on"
					}
					return "OK", nil
				}
			}
			return "NOT_FOUND", nil
		case "get_device_names":
			return c.getDeviceNames(), nil
		case "set_group_member":
			return c.setGroupMember(values["GROUP_ID"], values["CHANNEL_ID"], values["ACTION"] == "Add"), nil
		case "create_group":
			groups := c.groups(values["LIST_ID"])
			if groups == nil {
				return "NOT_FOUND", nil
			}
			id := c.nextID()
			*groups = append(*groups, Group{ID: id, Name: values["NAME"], Channels: []int64{}})
			return fmt.Sprintf("OK\t%d", id), nil
		case "rename_group", "delete_group":
			groups := c.groups(values["LIST_ID"])
			if groups == nil {
				return "NOT_FOUND", nil
			}
			for i, g := range *groups {
				if strconv.FormatInt(g.ID, 10) == values["ID"] {
					if s.name == "rename_group" {
						(*groups)[i].Name = values["NAME"]
					} else {
						*groups = append((*groups)[:i], (*groups)[i+1:]...)
					}
					return "OK\t" + g.Name, nil
				}
			}
			return "NOT_FOUND", nil
		case "create_sysvar":
			id := c.nextID()
			valueType, _ := strconv.Atoi(values["VALUE_TYPE"])
			subType, _ := strconv.Atoi(values["SUB_TYPE"])
			c.fixture.Sysvars = append(c.fixture.Sysvars, Sysvar{
				ID: id, Name: values["NAME"], Visible: true, ValueType: valueType, SubType: subType,
				Unit: values["UNIT"], Min: values["MIN"], Max: values["MAX"],
				FalseName: values["FALSE_NAME"], TrueName: values["TRUE_NAME"], ValueList: values["VALUE_LIST"],
				Value: parseRegaValue(strings.Trim(values["INITIAL"], `"`)),
			})
			return fmt.Sprintf("OK\t%d", id), nil
		case "clock_step":
			return "OK", nil
		case "edit_sysvar":
			for i := range c.fixture.Sysvars {
				if sv := &c.fixture.Sysvars[i]; strconv.FormatInt(sv.ID, 10) == values["ID"] {
					sv.Description, sv.Unit = values["INFO"], values["UNIT"]
					sv.Channel = 0
					if channel, _ := strconv.ParseInt(values["CHANNEL"], 10, 64); channel != 0 {
						for _, ch := range c.fixture.Channels {
							if ch.ID == channel {
								sv.Channel = channel
							}
						}
					}
					switch {
					case sv.ValueType == 2:
						sv.FalseName, sv.TrueName = values["FALSE_NAME"], values["TRUE_NAME"]
					case sv.SubType == 0:
						sv.Min, sv.Max = values["MIN"], values["MAX"]
						low, _ := strconv.ParseFloat(values["MIN"], 64)
						high, _ := strconv.ParseFloat(values["MAX"], 64)
						if v, ok := sv.Value.(float64); ok {
							sv.Value = math.Min(math.Max(v, low), high)
						}
					case sv.SubType == 29:
						sv.ValueList = values["VALUE_LIST"]
						high, _ := strconv.ParseFloat(values["MAX"], 64)
						if v, ok := sv.Value.(float64); ok && v > high {
							sv.Value = 0.0
						}
					}
					return "OK", nil
				}
			}
			return "NOT_FOUND", nil
		case "rename_sysvar", "delete_sysvar":
			for i, sv := range c.fixture.Sysvars {
				if strconv.FormatInt(sv.ID, 10) == values["ID"] {
					if s.name == "rename_sysvar" {
						c.fixture.Sysvars[i].Name = values["NAME"]
					} else {
						c.fixture.Sysvars = append(c.fixture.Sysvars[:i], c.fixture.Sysvars[i+1:]...)
					}
					return "OK\t" + sv.Name, nil
				}
			}
			return "NOT_FOUND", nil
		case "get_service_messages":
			return c.getServiceMessages(), nil
		case "acknowledge_service_message":
			for _, m := range c.serviceMessages() {
				if strconv.FormatInt(m.id, 10) == values["ID"] {
					// Acknowledging ends a sticky message
					if strings.HasPrefix(m.datapoint, "STICKY_") {
						m.channel.Datapoints[m.datapoint] = false
					}
					return "OK\t" + m.datapoint, nil
				}
			}
			return "NOT_FOUND", nil
		case "get_alarm_messages":
			var b strings.Builder
			for _, sv := range c.fixture.Sysvars {
				if sv.SubType != 6 || sv.AlarmCounter == 0 || sv.receipted {
					continue
				}
				message := sv.FalseName
				if sv.Value == true {
					message = sv.TrueName
				}
				fmt.Fprintf(&b, "A\t%d\t%t\t%d\t%s\t%s\t\t\t%s\t%s\n",
					sv.ID, sv.Value == true, sv.AlarmCounter, sv.AlarmTime, sv.AlarmTime, message, sv.Name)
			}
			return b.String(), nil
		case "acknowledge_alarm_message":
			for i := range c.fixture.Sysvars {
				if sv := &c.fixture.Sysvars[i]; strconv.FormatInt(sv.ID, 10) == values["ID"] && sv.SubType == 6 {
					sv.receipted = true
					return "OK\t" + sv.Name, nil
				}
			}
			return "NOT_FOUND", nil
		case "get_favorites":
			return c.getFavorites(values["USERNAME"]), nil
		case "favorite_change":
			return c.changeFavorite(values), nil
		case "set_channel_tile":
			id, _ := strconv.ParseInt(values["ID"], 10, 64)
			if ch := c.channelByID(id); ch != nil {
				ch.Tile = values["TILE"]
				return "OK\t" + ch.Name, nil
			}
			return "NOT_FOUND", nil
		case "set_channel_mode":
			ch := c.channelByAddress(values["INTERFACE"], values["ADDRESS"])
			mode, err := strconv.Atoi(values["MODE"])
			if ch == nil || err != nil {
				return "NOT_FOUND", nil
			}
			ch.Mode = &mode
			return "OK", nil
		case "set_channel_option":
			id, _ := strconv.ParseInt(values["ID"], 10, 64)
			ch := c.channelByID(id)
			if ch == nil {
				return "NOT_FOUND", nil
			}
			value := values["VALUE"] == "true"
			switch values["OPTION"] {
			case "visible":
				ch.Hidden = !value
			case "usable":
				ch.ReadOnly = !value
			case "logged":
				ch.Logged = value
			case "aes":
				ch.AES = value
			}
			return "OK\t" + ch.Name, nil
		case "get_read_only_channels":
			var b strings.Builder
			for _, ch := range c.fixture.Channels {
				if ch.ReadOnly {
					b.WriteString(ch.Address + "\n")
				}
			}
			return b.String(), nil
		case "get_history":
			// Per logged channel its STATE once and 24 hourly values of its
			// numbers (LEVEL, temperature, humidity), newest first
			if c.historyCleared {
				return "N\t0\n", nil
			}
			only, _ := strconv.ParseInt(values["CHANNEL"], 10, 64)
			var lines []string
			now := time.Date(2026, 10, 3, 21, 0, 0, 0, time.UTC)
			n := 0
			for _, ch := range c.fixture.Channels {
				if !ch.Logged {
					continue
				}
				for _, dp := range []string{"STATE", "LEVEL", "ACTUAL_TEMPERATURE", "HUMIDITY"} {
					value, ok := ch.Datapoints[dp]
					if !ok {
						continue
					}
					steps := 24
					if dp == "STATE" {
						steps = 1
					}
					for i := 0; i < steps; i++ {
						n++
						v := value
						if f, isNumber := value.(float64); isNumber && steps > 1 {
							v = math.Round((f+math.Sin(float64(i)/3)*2)*10) / 10
						}
						if only == 0 || only == ch.ID {
							lines = append(lines, fmt.Sprintf("H\t%d\t%s\tchannel\t%s\t%s\t%v\t", n, now.Add(-time.Duration(i)*time.Hour).Format("2006-01-02 15:04:05"), ch.Name, dp, v))
						}
					}
				}
			}
			sort.SliceStable(lines, func(i, j int) bool { return strings.Split(lines[i], "\t")[2] > strings.Split(lines[j], "\t")[2] })
			return fmt.Sprintf("N\t%d\n%s\n", n, strings.Join(lines, "\n")), nil
		case "clear_history":
			c.historyCleared = true
			return "OK", nil
		case "set_logic_option":
			id, _ := strconv.ParseInt(values["ID"], 10, 64)
			value := values["VALUE"] == "true"
			for i := range c.fixture.Programs {
				if p := &c.fixture.Programs[i]; p.ID == id {
					switch values["OPTION"] {
					case "visible":
						previous := p.Visible
						p.Visible = value
						return fmt.Sprintf("OK\t%t", previous), nil
					case "operate":
						previous := !p.ReadOnly
						p.ReadOnly = !value
						return fmt.Sprintf("OK\t%t", previous), nil
					}
				}
			}
			for i := range c.fixture.Sysvars {
				if sv := &c.fixture.Sysvars[i]; sv.ID == id && values["OPTION"] == "visible" {
					previous := sv.Visible
					sv.Visible = value
					return fmt.Sprintf("OK\t%t", previous), nil
				}
			}
			return "NOT_FOUND", nil
		case "check_script":
			code := strings.ReplaceAll(values["CODE"], `^#"^"#^`, "^")
			return checkTestScript(code), nil
		case "get_log_level":
			return strconv.Itoa(c.regaLogLevel), nil
		case "set_log_level":
			c.regaLogLevel, _ = strconv.Atoi(values["LEVEL"])
			return "OK", nil
		case "get_program":
			return c.getProgram(atoi64(values["ID"])), nil
		case "save_program":
			return c.saveProgram(values["DATA"]), nil
		case "delete_program":
			for i, p := range c.fixture.Programs {
				if strconv.FormatInt(p.ID, 10) == values["ID"] {
					c.fixture.Programs = append(c.fixture.Programs[:i], c.fixture.Programs[i+1:]...)
					return "OK\t" + p.Name, nil
				}
			}
			return "NOT_FOUND", nil
		case "get_layout", "set_layout":
			id := values["ID"]
			known := false
			for _, g := range append(append([]Group{}, c.fixture.Rooms...), c.fixture.Trades...) {
				known = known || strconv.FormatInt(g.ID, 10) == id
			}
			for _, f := range c.fixture.Favorites {
				known = known || strconv.FormatInt(f.ID, 10) == id
			}
			if !known {
				return "NOT_FOUND", nil
			}
			if c.layouts == nil {
				c.layouts = map[string]string{}
			}
			if s.name == "set_layout" {
				c.layouts[id] = values["LAYOUT"]
				return "OK\tview", nil
			}
			return "OK\t" + c.layouts[id], nil
		case "get_users":
			var b strings.Builder
			for _, u := range c.users() {
				fmt.Fprintf(&b, "U\t%d\t%s\t%s\t%s\t%d\t%t\t%t\t%t\t%s\t%s\n",
					u.ID, u.Name, u.FirstName, u.LastName, u.Level, u.Password != "", u.ShowLogin, u.Name != "Admin", u.Mail, u.Phone)
			}
			fmt.Fprintf(&b, "A\t%d\n", c.autoLoginUser)
			return b.String(), nil
		case "start_com_test", "poll_com_test":
			// Reachable devices answer at once, unreachable ones never
			address := values["ADDRESS"]
			var maintenance *Channel
			known := false
			for i := range c.fixture.Channels {
				if deviceAddress(c.fixture.Channels[i].Address) == address {
					known = true
					if strings.HasSuffix(c.fixture.Channels[i].Address, ":0") {
						maintenance = &c.fixture.Channels[i]
					}
				}
			}
			if !known {
				return "NOT_FOUND", nil
			}
			if s.name == "start_com_test" {
				return "OK\t" + time.Now().Format("2006-01-02 15:04:05"), nil
			}
			if maintenance != nil && maintenance.Datapoints["UNREACH"] == true {
				return "OK\t", nil
			}
			return "OK\t" + values["SINCE"], nil
		case "get_virtual_keys":
			var b strings.Builder
			for _, ch := range c.fixture.Channels {
				if isVirtualKey(ch.Address) {
					programs := strings.Count(c.deviceProgramUsages(strings.Split(ch.Address, ":")[0]), "\t"+ch.Address+"\n")
					fmt.Fprintf(&b, "K\t%d\t%s\t%s\t%d\t%s\n", ch.ID, ch.Address, ch.Interface, programs, ch.Name)
				}
			}
			return b.String(), nil
		case "get_device_programs":
			return c.deviceProgramUsages(values["ADDRESS"]), nil
		case "set_user_password":
			for i := range c.fixture.Users {
				if c.fixture.Users[i].Name == values["USERNAME"] {
					c.fixture.Users[i].Password = values["PASSWORD"]
					return "OK\t" + values["USERNAME"], nil
				}
			}
			return "NOT_FOUND", nil
		case "save_user":
			return c.saveUser(values), nil
		case "delete_user":
			users := c.users()
			for i, u := range users {
				if strconv.FormatInt(u.ID, 10) == values["ID"] && u.Name != "Admin" {
					c.fixture.Users = append(users[:i], users[i+1:]...)
					return "OK\t" + u.Name, nil
				}
			}
			return "NOT_FOUND", nil
		case "get_system_settings":
			lat, lon := c.latitude, c.longitude
			if lat == "" {
				lat, lon = "52.520000", "13.405000"
			}
			return fmt.Sprintf("OK\t%s\t%s\t60.000000\t%s", lat, lon, time.Now().Format("2006-01-02 15:04:05")), nil
		case "set_location":
			c.latitude, c.longitude = values["LATITUDE"], values["LONGITUDE"]
			return "OK", nil
		case "get_build_label":
			return FakeRegaBuild, nil
		case "save_system":
			return "OK", nil
		case "get_user_level":
			for _, user := range c.fixture.Users {
				if user.Name == values["USERNAME"] {
					return strconv.Itoa(user.Level), nil
				}
			}
			return "", nil
		}
	}
	// A script tested in the editor: only Write/WriteLine of strings
	return runTestScript(body)
}

// The statements the fake runs of a tested script
var (
	writeRegex = regexp.MustCompile(`^(Write|WriteLine)\("([^"]*)"\)$`)
)

// checkTestScript stands in for system.SyntaxCheck: every statement must be
// Write("…") or WriteLine("…")
func checkTestScript(code string) string {
	for i, statement := range strings.Split(code, ";") {
		statement = strings.TrimSpace(statement)
		if statement != "" && !writeRegex.MatchString(statement) {
			return fmt.Sprintf("Error 1 at row %d col 1 near ^%s^", i+1, statement)
		}
	}
	return ""
}

func runTestScript(code string) (string, error) {
	if checkTestScript(code) != "" {
		return "", fmt.Errorf("unknown script")
	}
	var b strings.Builder
	for _, statement := range strings.Split(code, ";") {
		if m := writeRegex.FindStringSubmatch(strings.TrimSpace(statement)); m != nil {
			b.WriteString(m[2])
			if m[1] == "WriteLine" {
				b.WriteString("\n")
			}
		}
	}
	return b.String(), nil
}

// itemType says what a favorite list entry is, as get_favorites.tcl
// writes it, or "" if there is no such object.
func (c *CCU) itemType(id int64) string {
	if c.channelByID(id) != nil {
		return "CHANNEL"
	}
	for _, sv := range c.fixture.Sysvars {
		if sv.ID == id {
			return "SYSVAR"
		}
	}
	for _, p := range c.fixture.Programs {
		if p.ID == id {
			return "PROGRAM"
		}
	}
	return ""
}

func (c *CCU) getFavorites(username string) string {
	var b strings.Builder
	for _, f := range c.fixture.Favorites {
		if username != "" && !slices.Contains(f.Users, username) {
			continue
		}
		fmt.Fprintf(&b, "L\t%d\t%s\n", f.ID, f.Name)
		for _, id := range f.Items {
			if t := c.itemType(id); t != "" {
				fmt.Fprintf(&b, "I\t%d\t%s\n", id, t)
			}
		}
	}
	return b.String()
}

func (c *CCU) changeFavorite(values map[string]string) string {
	if values["ACTION"] == "create" {
		users := []string{}
		for _, u := range c.fixture.Users {
			if values["USERNAME"] == "" || u.Name == values["USERNAME"] {
				users = append(users, u.Name)
			}
		}
		id := c.nextID()
		c.fixture.Favorites = append(c.fixture.Favorites, Favorite{ID: id, Name: values["NAME"], Users: users, Items: []int64{}})
		return fmt.Sprintf("OK\t%d", id)
	}
	listID, _ := strconv.ParseInt(values["LIST_ID"], 10, 64)
	itemID, _ := strconv.ParseInt(values["ITEM_ID"], 10, 64)
	for i := range c.fixture.Favorites {
		f := &c.fixture.Favorites[i]
		if f.ID != listID {
			continue
		}
		previous := f.Name
		switch values["ACTION"] {
		case "rename":
			f.Name = values["NAME"]
		case "delete":
			c.fixture.Favorites = append(c.fixture.Favorites[:i], c.fixture.Favorites[i+1:]...)
		case "add", "remove":
			if c.itemType(itemID) == "" {
				return "NOT_FOUND"
			}
			f.Items = slices.DeleteFunc(f.Items, func(id int64) bool { return id == itemID })
			if values["ACTION"] == "add" {
				f.Items = append(f.Items, itemID)
			}
		}
		return "OK\t" + previous
	}
	return "NOT_FOUND"
}

// groups returns the rooms or trades for a ReGa list constant.
func (c *CCU) groups(listID string) *[]Group {
	switch listID {
	case "ID_ROOMS":
		return &c.fixture.Rooms
	case "ID_FUNCTIONS":
		return &c.fixture.Trades
	}
	return nil
}

// deviceProgramUsages finds the programs whose conditions or destinations
// name a channel of the device, as get_device_programs.tcl
func (c *CCU) deviceProgramUsages(address string) string {
	var b strings.Builder
	for _, ch := range c.fixture.Channels {
		if !strings.HasPrefix(ch.Address, address+":") {
			continue
		}
		for _, p := range c.fixture.Programs {
			used := false
			var branches []rega.ProgramBranch
			for _, rule := range p.Rules {
				for _, group := range rule.Groups {
					for _, cond := range group {
						used = used || cond.Channel == ch.ID
					}
				}
				branches = append(branches, rule.ProgramBranch)
			}
			if p.Else != nil {
				branches = append(branches, *p.Else)
			}
			for _, branch := range branches {
				for _, dest := range branch.Destinations {
					used = used || dest.Channel == ch.ID
				}
			}
			if used {
				fmt.Fprintf(&b, "P\t%d\t%s\t%s\n", p.ID, p.Name, ch.Address)
			}
		}
	}
	return b.String()
}

// isVirtualKey: a channel of the CCU's own HM-RCV-50 (BidCoS-RF) or
// HmIP-RCV-50 (HmIP-RCV-1) device
func isVirtualKey(address string) bool {
	return strings.HasPrefix(address, "BidCoS-RF:") || strings.HasPrefix(address, "HmIP-RCV-1:")
}

// users returns the fixture's users, with ids
func (c *CCU) users() []User {
	for i := range c.fixture.Users {
		if c.fixture.Users[i].ID == 0 {
			c.fixture.Users[i].ID = 1001 + int64(i)
		}
	}
	return c.fixture.Users
}

// saveUser creates or changes a user as save_user.tcl
func (c *CCU) saveUser(values map[string]string) string {
	users := c.users()
	id := values["ID"]
	for _, u := range users {
		if u.Name == values["NAME"] && strconv.FormatInt(u.ID, 10) != id {
			return "EXISTS"
		}
	}
	index := -1
	if id == "0" {
		users = append(users, User{ID: c.nextID(), Password: values["PASSWORD"]})
		index = len(users) - 1
	} else {
		for i, u := range users {
			if strconv.FormatInt(u.ID, 10) == id {
				index = i
			}
		}
		if index < 0 {
			return "NOT_FOUND"
		}
		if values["SET_PASSWORD"] == "true" {
			users[index].Password = values["PASSWORD"]
		}
	}
	u := &users[index]
	u.Name, u.FirstName, u.LastName = values["NAME"], values["FIRST_NAME"], values["LAST_NAME"]
	u.Level, _ = strconv.Atoi(values["LEVEL"])
	u.ShowLogin = values["SHOW_LOGIN"] == "true"
	u.Mail, u.Phone = values["MAIL"], values["PHONE"]
	if values["AUTO_LOGIN"] == "true" {
		c.autoLoginUser = u.ID
	} else if c.autoLoginUser == u.ID {
		c.autoLoginUser = 0
	}
	c.fixture.Users = users
	return fmt.Sprintf("OK\t%d", u.ID)
}

// nextID returns an id no ReGa object of the fixture uses yet.
func (c *CCU) nextID() int64 {
	var highest int64 = 100000
	for _, g := range append(append([]Group{}, c.fixture.Rooms...), c.fixture.Trades...) {
		highest = max(highest, g.ID)
	}
	for _, ch := range c.fixture.Channels {
		highest = max(highest, ch.ID)
	}
	for _, sv := range c.fixture.Sysvars {
		highest = max(highest, sv.ID)
	}
	for _, p := range c.fixture.Programs {
		highest = max(highest, p.ID)
	}
	for _, f := range c.fixture.Favorites {
		highest = max(highest, f.ID)
	}
	for _, u := range c.fixture.Users {
		highest = max(highest, u.ID)
	}
	return highest + 1
}

func writeGroups(groups []Group) string {
	var b strings.Builder
	for _, g := range groups {
		fmt.Fprintf(&b, "%d\t%s\n", g.ID, g.Name)
	}
	return b.String()
}

func (c *CCU) channelByID(id int64) *Channel {
	for i := range c.fixture.Channels {
		if c.fixture.Channels[i].ID == id {
			return &c.fixture.Channels[i]
		}
	}
	return nil
}

func (c *CCU) channelByAddress(iface, address string) *Channel {
	for i := range c.fixture.Channels {
		ch := &c.fixture.Channels[i]
		if ch.Address == address && (iface == "" || ch.Interface == iface) {
			return ch
		}
	}
	return nil
}

// valueType returns the ReGa value type the add-on parses (see rega/parse.go).
func valueType(v interface{}) string {
	switch v.(type) {
	case bool:
		return "2"
	case float64, int:
		return "4"
	}
	return "20"
}

func formatValue(v interface{}) string {
	switch x := v.(type) {
	case nil:
		return ""
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	}
	return fmt.Sprint(v)
}

func deviceAddress(address string) string {
	device, _, _ := strings.Cut(address, ":")
	return device
}

func (c *CCU) getChannels(objectID string) string {
	var channels []*Channel
	if objectID == "ALL" {
		for i := range c.fixture.Channels {
			// Like get_channels.tcl, without the CCU's own virtual keys
			if !strings.HasSuffix(c.fixture.Channels[i].Address, ":0") && !isVirtualKey(c.fixture.Channels[i].Address) {
				channels = append(channels, &c.fixture.Channels[i])
			}
		}
	} else {
		id, _ := strconv.ParseInt(objectID, 10, 64)
		// Favorite lists hold channels among system variables and programs
		for _, f := range c.fixture.Favorites {
			if f.ID == id {
				for _, itemID := range f.Items {
					if ch := c.channelByID(itemID); ch != nil {
						channels = append(channels, ch)
					}
				}
			}
		}
		for _, g := range append(append([]Group{}, c.fixture.Rooms...), c.fixture.Trades...) {
			if g.ID != id {
				continue
			}
			for _, channelID := range g.Channels {
				if ch := c.channelByID(channelID); ch != nil {
					channels = append(channels, ch)
				}
			}
		}
	}

	var b strings.Builder
	// S lines once per device, with its first channel listed
	statusWritten := map[string]bool{}
	for _, ch := range channels {
		fmt.Fprintf(&b, "C\t%d\t%s\t%s\t%s\t%s\n", ch.ID, ch.Address, ch.Type, ch.Interface, ch.Name)
		fmt.Fprintf(&b, "M\t%s\t%s\n", memberOf(c.fixture.Rooms, ch.ID), memberOf(c.fixture.Trades, ch.ID))
		fmt.Fprintf(&b, "F\t%t\t%t\t%t\t%t\n", !ch.Hidden, !ch.ReadOnly, ch.Logged, ch.AES)
		if ch.Tile != "" {
			fmt.Fprintf(&b, "T\t%s\n", ch.Tile)
		}
		if ch.Mode != nil {
			fmt.Fprintf(&b, "O\t%d\n", *ch.Mode)
		}
		if status := c.channelByAddress(ch.Interface, deviceAddress(ch.Address)+":0"); status != nil {
			fmt.Fprintf(&b, "A\t%s\n", status.Address)
			if !statusWritten[status.Address] {
				statusWritten[status.Address] = true
				for _, dp := range []string{"LOW_BAT", "LOWBAT", "UNREACH"} {
					if v, ok := status.Datapoints[dp]; ok {
						fmt.Fprintf(&b, "S\t%s\t%s\t%s\n", status.Address, dp, formatValue(v))
					}
				}
			}
		}
		for name, v := range ch.Datapoints {
			fmt.Fprintf(&b, "D\t%s\t%s\t%s\n", name, valueType(v), formatValue(v))
		}
	}
	return b.String()
}

// memberOf returns the ids of the groups containing a channel, comma separated.
func memberOf(groups []Group, channelID int64) string {
	var ids []string
	for _, g := range groups {
		for _, id := range g.Channels {
			if id == channelID {
				ids = append(ids, strconv.FormatInt(g.ID, 10))
			}
		}
	}
	return strings.Join(ids, ",")
}

func (c *CCU) getSysvars() string {
	var b strings.Builder
	for _, sv := range c.fixture.Sysvars {
		fmt.Fprintf(&b, "V\t%d\t%t\t%s\n", sv.ID, sv.Visible, sv.Name)
		fmt.Fprintf(&b, "T\t%d\t%d\t%s\n", sv.ValueType, sv.SubType, sv.Unit)
		fmt.Fprintf(&b, "R\t%s\t%s\n", sv.Min, sv.Max)
		fmt.Fprintf(&b, "B\t%s\t%s\n", sv.FalseName, sv.TrueName)
		fmt.Fprintf(&b, "L\t%s\n", sv.ValueList)
		fmt.Fprintf(&b, "X\t%s\n", formatValue(sv.Value))
		fmt.Fprintf(&b, "I\t%s\n", strings.NewReplacer("%", "%25", "\t", "%09", "\r", "%0D", "\n", "%0A").Replace(sv.Description))
		fmt.Fprintf(&b, "C\t%d\n", sv.Channel)
	}
	return b.String()
}

// ProgramRuns returns how often a program was run.
func (c *CCU) ProgramRuns(id int64) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, p := range c.fixture.Programs {
		if p.ID == id {
			return p.Runs
		}
	}
	return 0
}

// device returns the description of a device and its interface.
func (c *CCU) device(address string) (map[string]interface{}, string) {
	for iface, data := range c.fixture.Interfaces {
		for _, d := range data.Devices {
			if d["ADDRESS"] == address {
				return d, iface
			}
		}
	}
	return nil, ""
}

func (c *CCU) getInbox() string {
	var b strings.Builder
	for _, address := range c.fixture.Inbox {
		d, iface := c.device(address)
		if d == nil {
			continue
		}
		name := c.fixture.DeviceNames[address]
		if name == "" {
			name = fmt.Sprintf("%v %s", d["TYPE"], address)
		}
		fmt.Fprintf(&b, "%s\t%v\t%s\t%s\n", address, d["TYPE"], iface, name)
	}
	return b.String()
}

// deleteDevice removes a device with its channels everywhere; c.mu must be held.
// AddInboxDevice puts a new, not yet set up device with one channel into the
// inbox (for tests).
func (c *CCU) AddInboxDevice(iface, address, deviceType string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.addInboxDevice(iface, address, deviceType)
}

// addInboxDevice is AddInboxDevice with c.mu held
func (c *CCU) addInboxDevice(iface, address, deviceType string) {
	data := c.fixture.Interfaces[iface]
	if data == nil {
		data = &InterfaceData{}
		c.fixture.Interfaces[iface] = data
	}
	data.Devices = append(data.Devices,
		map[string]interface{}{"ADDRESS": address, "TYPE": deviceType, "PARENT": "", "CHILDREN": []interface{}{address + ":1"}, "PARAMSETS": []interface{}{"MASTER"}, "VERSION": 1},
		map[string]interface{}{"ADDRESS": address + ":1", "TYPE": "SWITCH", "PARENT": address, "PARENT_TYPE": deviceType, "INDEX": 1, "PARAMSETS": []interface{}{"MASTER", "VALUES"}, "VERSION": 1},
	)
	c.fixture.Inbox = append(c.fixture.Inbox, address)
}

// replaceDevice moves the old device's place (channels, rooms, programs)
// to the new device, as replaceDevice does: the new device's own entries
// go, the old ones take its address.
func (c *CCU) replaceDevice(iface, oldAddress, newAddress string) bool {
	data := c.fixture.Interfaces[iface]
	oldFound, newFound := false, false
	for _, d := range data.Devices {
		oldFound = oldFound || d["ADDRESS"] == oldAddress
		newFound = newFound || d["ADDRESS"] == newAddress
	}
	if !oldFound || !newFound {
		return false
	}
	kept := data.Devices[:0]
	for _, d := range data.Devices {
		if d["ADDRESS"] == newAddress || d["PARENT"] == newAddress {
			continue
		}
		swap := func(v interface{}) interface{} {
			if a, ok := v.(string); ok && (a == oldAddress || strings.HasPrefix(a, oldAddress+":")) {
				return newAddress + strings.TrimPrefix(a, oldAddress)
			}
			return v
		}
		d["ADDRESS"], d["PARENT"] = swap(d["ADDRESS"]), swap(d["PARENT"])
		if children, ok := d["CHILDREN"].([]interface{}); ok {
			for i := range children {
				children[i] = swap(children[i])
			}
		}
		kept = append(kept, d)
	}
	data.Devices = kept
	for i := range c.fixture.Channels {
		ch := &c.fixture.Channels[i]
		if ch.Interface == iface && deviceAddress(ch.Address) == oldAddress {
			ch.Address = newAddress + strings.TrimPrefix(ch.Address, oldAddress)
		}
	}
	if name, ok := c.fixture.DeviceNames[oldAddress]; ok {
		c.fixture.DeviceNames[newAddress] = name
		delete(c.fixture.DeviceNames, oldAddress)
	}
	c.fixture.Inbox = slices.DeleteFunc(c.fixture.Inbox, func(a string) bool { return a == newAddress })
	return true
}

func (c *CCU) deleteDevice(iface, address string) bool {
	data := c.fixture.Interfaces[iface]
	found := false
	kept := data.Devices[:0]
	for _, d := range data.Devices {
		if d["ADDRESS"] == address || d["PARENT"] == address {
			found = true
			continue
		}
		kept = append(kept, d)
	}
	data.Devices = kept
	if !found {
		return false
	}
	var removed []int64
	channels := c.fixture.Channels[:0]
	for _, ch := range c.fixture.Channels {
		if ch.Interface == iface && deviceAddress(ch.Address) == address {
			removed = append(removed, ch.ID)
			continue
		}
		channels = append(channels, ch)
	}
	c.fixture.Channels = channels
	for _, groups := range []*[]Group{&c.fixture.Rooms, &c.fixture.Trades} {
		for i := range *groups {
			g := &(*groups)[i]
			members := []int64{}
			for _, id := range g.Channels {
				gone := false
				for _, r := range removed {
					gone = gone || id == r
				}
				if !gone {
					members = append(members, id)
				}
			}
			g.Channels = members
		}
	}
	inbox := c.fixture.Inbox[:0]
	for _, a := range c.fixture.Inbox {
		if a != address {
			inbox = append(inbox, a)
		}
	}
	c.fixture.Inbox = inbox
	return true
}

func (c *CCU) getDeviceNames() string {
	var b strings.Builder
	for _, data := range c.fixture.Interfaces {
		for _, d := range data.Devices {
			address, _ := d["ADDRESS"].(string)
			if parent, _ := d["PARENT"].(string); parent != "" || address == "" {
				continue
			}
			name := c.fixture.DeviceNames[address]
			if name == "" {
				name = fmt.Sprintf("%v %s", d["TYPE"], address)
			}
			fmt.Fprintf(&b, "%s\t%s\n", address, name)
		}
	}
	return b.String()
}

func (c *CCU) setName(address, name string) string {
	if !strings.Contains(address, ":") {
		previous := c.fixture.DeviceNames[address]
		if previous == "" && c.channelByAddress("", address+":0") == nil && c.channelByAddress("", address+":1") == nil {
			return "NOT_FOUND"
		}
		if c.fixture.DeviceNames == nil {
			c.fixture.DeviceNames = map[string]string{}
		}
		c.fixture.DeviceNames[address] = name
		return "OK\t" + previous
	}
	ch := c.channelByAddress("", address)
	if ch == nil {
		return "NOT_FOUND"
	}
	previous := ch.Name
	ch.Name = name
	return "OK\t" + previous
}

func (c *CCU) setGroupMember(groupID, channelID string, member bool) string {
	gid, _ := strconv.ParseInt(groupID, 10, 64)
	cid, _ := strconv.ParseInt(channelID, 10, 64)
	if c.channelByID(cid) == nil {
		return "NOT_FOUND"
	}
	for _, groups := range []*[]Group{&c.fixture.Rooms, &c.fixture.Trades} {
		for i := range *groups {
			g := &(*groups)[i]
			if g.ID != gid {
				continue
			}
			kept := []int64{}
			for _, id := range g.Channels {
				if id != cid {
					kept = append(kept, id)
				}
			}
			if member {
				kept = append(kept, cid)
			}
			g.Channels = kept
			return "OK"
		}
	}
	return "NOT_FOUND"
}

// parseRegaValue parses a value as the add-on writes it into a script:
// true/false, a number or a quoted string.
func parseRegaValue(s string) interface{} {
	if s == "true" || s == "false" {
		return s == "true"
	}
	if f, err := strconv.ParseFloat(s, 64); err == nil {
		return f
	}
	return strings.Trim(s, `"`)
}

func (c *CCU) setDatapoint(values map[string]string) string {
	ch := c.channelByAddress(values["INTERFACE"], values["ADDRESS"])
	if ch == nil {
		return "NOT_FOUND"
	}
	if _, ok := ch.Datapoints[values["ATTRIBUTE"]]; !ok {
		return "NOT_FOUND"
	}
	previous := formatValue(ch.Datapoints[values["ATTRIBUTE"]])
	c.setValue(ch, values["ATTRIBUTE"], parseRegaValue(values["VALUE"]))
	return "OK\t" + previous
}

// setValue changes a datapoint and sends the event; c.mu must be held.
func (c *CCU) setValue(ch *Channel, datapoint string, value interface{}) {
	ch.Datapoints[datapoint] = value
	if c.Lite {
		c.publishLite("event", map[string]interface{}{"interface": ch.Interface, "address": ch.Address, "key": datapoint, "value": value})
	}
	for id, url := range c.callbacks[ch.Interface] {
		c.events <- callbackEvent{url: url, interfaceID: id, address: ch.Address, datapoint: datapoint, value: value}
	}
}

// SetValue changes a datapoint as if the device had reported it, e.g. a
// window being opened, and sends the event.
func (c *CCU) SetValue(iface, address, datapoint string, value interface{}) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	ch := c.channelByAddress(iface, address)
	if ch == nil {
		return fmt.Errorf("no channel %s %s", iface, address)
	}
	c.setValue(ch, datapoint, value)
	return nil
}

func (c *CCU) getDeviceProblems() string {
	var b strings.Builder
	for _, ch := range c.fixture.Channels {
		if !strings.HasSuffix(ch.Address, ":0") || ch.Interface == "VirtualDevices" {
			continue
		}
		lowBat := ch.Datapoints["LOW_BAT"] == true || ch.Datapoints["LOWBAT"] == true
		unreach := ch.Datapoints["UNREACH"] == true
		if !lowBat && !unreach {
			continue
		}
		device := deviceAddress(ch.Address)
		roomID, roomName := "", ""
		if first := c.channelByAddress(ch.Interface, device+":1"); first != nil {
			for _, room := range c.fixture.Rooms {
				for _, id := range room.Channels {
					if id == first.ID && roomID == "" {
						roomID, roomName = strconv.FormatInt(room.ID, 10), room.Name
					}
				}
			}
		}
		name := c.fixture.DeviceNames[device]
		if name == "" {
			name = device
		}
		fmt.Fprintf(&b, "P\t%s\t%t\t%t\t%s\t%s\t%s\n", device, lowBat, unreach, roomID, roomName, name)
	}
	return b.String()
}

// The values get_device_health.tcl reports, as the fake has them (the time
// stamp is the fake's start)
var healthDatapoints = []string{"LOW_BAT", "LOWBAT", "OPERATING_VOLTAGE", "RSSI_DEVICE", "RSSI_PEER", "UNREACH",
	"STICKY_UNREACH", "CONFIG_PENDING", "UPDATE_PENDING", "DUTY_CYCLE", "SABOTAGE"}

func (c *CCU) getDeviceHealth() string {
	var b strings.Builder
	for _, ch := range c.fixture.Channels {
		if !strings.HasSuffix(ch.Address, ":0") || ch.Interface == "VirtualDevices" {
			continue
		}
		device := deviceAddress(ch.Address)
		deviceType := ""
		if data := c.fixture.Interfaces[ch.Interface]; data != nil {
			for _, d := range data.Devices {
				if d["ADDRESS"] == device {
					deviceType, _ = d["TYPE"].(string)
				}
			}
		}
		roomID, roomName := "", ""
		if first := c.channelByAddress(ch.Interface, device+":1"); first != nil {
			for _, room := range c.fixture.Rooms {
				for _, id := range room.Channels {
					if id == first.ID && roomID == "" {
						roomID, roomName = strconv.FormatInt(room.ID, 10), room.Name
					}
				}
			}
		}
		var values strings.Builder
		for _, name := range healthDatapoints {
			if v, ok := ch.Datapoints[name]; ok {
				fmt.Fprintf(&values, "%s=%v@%d;", name, v, c.Started.Unix())
			}
		}
		name := c.fixture.DeviceNames[device]
		if name == "" {
			name = device
		}
		fmt.Fprintf(&b, "H\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n", device, deviceType, ch.Interface, roomID, roomName, values.String(), name)
	}
	return b.String()
}

// serviceDatapoints raise a service message while true (or, for the error
// codes, not 0), in the order ReGa would number their alarms.
var serviceDatapoints = []string{
	"UNREACH", "STICKY_UNREACH", "LOW_BAT", "LOWBAT", "CONFIG_PENDING", "UPDATE_PENDING",
	"SABOTAGE", "STICKY_SABOTAGE", "ERROR_CODE", "DUTY_CYCLE", "DEVICE_IN_BOOTLOADER",
}

type serviceMessage struct {
	id        int64
	channel   *Channel
	datapoint string
}

func (c *CCU) serviceMessages() []serviceMessage {
	var messages []serviceMessage
	for i := range c.fixture.Channels {
		ch := &c.fixture.Channels[i]
		if !strings.HasSuffix(ch.Address, ":0") || ch.Interface == "VirtualDevices" {
			continue
		}
		for j, datapoint := range serviceDatapoints {
			value, ok := ch.Datapoints[datapoint]
			if !ok || value == false || value == nil || value == 0.0 || value == 0 {
				continue
			}
			messages = append(messages, serviceMessage{id: ch.ID*100 + int64(j), channel: ch, datapoint: datapoint})
		}
	}
	return messages
}

func (c *CCU) getServiceMessages() string {
	var b strings.Builder
	for _, m := range c.serviceMessages() {
		device := deviceAddress(m.channel.Address)
		roomID, roomName := "", ""
		if first := c.channelByAddress(m.channel.Interface, device+":1"); first != nil {
			for _, room := range c.fixture.Rooms {
				for _, id := range room.Channels {
					if id == first.ID && roomID == "" {
						roomID, roomName = strconv.FormatInt(room.ID, 10), room.Name
					}
				}
			}
		}
		name := c.fixture.DeviceNames[device]
		if name == "" {
			name = device
		}
		fmt.Fprintf(&b, "S\t%d\t%s\t%s\t2026-01-15 09:00:00\t%s\t%s\t%s\t%s\n",
			m.id, m.datapoint, formatValue(m.channel.Datapoints[m.datapoint]), device, roomID, roomName, name)
	}
	return b.String()
}

// Reset restores the fixture as it was loaded; the callbacks stay.
func (c *CCU) Reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	var fixture Fixture
	_ = json.Unmarshal(c.original, &fixture)
	if fixture.Interfaces == nil {
		fixture.Interfaces = map[string]*InterfaceData{}
	}
	c.fixture = &fixture
	c.metadata = map[string]map[string]interface{}{}
}

// SetSysvar changes a system variable inside the CCU, as a program would
// (no event: system variables send none). Reports whether it exists.
func (c *CCU) SetSysvar(id int64, value interface{}) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	for i := range c.fixture.Sysvars {
		if sv := &c.fixture.Sysvars[i]; sv.ID == id {
			sv.Value = value
			return true
		}
	}
	return false
}

// Metadata returns what setMetadata stored for an object, nil if nothing.
func (c *CCU) Metadata(iface, objectID, dataID string) interface{} {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.metadata[iface][objectID+"/"+dataID]
}

// ChannelMode returns the ReGa metadata "channelMode" of a channel.
func (c *CCU) ChannelMode(iface, address string) *int {
	c.mu.Lock()
	defer c.mu.Unlock()
	if ch := c.channelByAddress(iface, address); ch != nil {
		return ch.Mode
	}
	return nil
}

// --- WebUI login and test control -----------------------------------------

// handleControl lets tests outside Go drive the fake CCU:
//
//	POST /fake/set   {"interface", "address", "datapoint", "value"}  a device reports a value
//	POST /fake/reset                                                  back to the fixture
func (c *CCU) handleControl(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	switch r.URL.Path {
	case "/fake/reset":
		c.Reset()
	case "/fake/set":
		var req struct {
			Interface string      `json:"interface"`
			Address   string      `json:"address"`
			Datapoint string      `json:"datapoint"`
			Value     interface{} `json:"value"`
		}
		if err := jsonDecode(r.Body, &req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := c.SetValue(req.Interface, req.Address, req.Datapoint, req.Value); err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
	default:
		http.NotFound(w, r)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (c *CCU) handleWebUI(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/fake/") {
		c.handleControl(w, r)
		return
	}
	if c.Lite {
		c.handleOcculited(w, r)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/pages/jpages/group/") && r.Method == http.MethodPost {
		c.handleGroups(w, r)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/pages/jpages/system/DeviceFirmware/") && r.Method == http.MethodPost {
		c.handleDeviceFirmware(w, r)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/firmware/") {
		c.handleUpdateServer(w, r)
		return
	}
	if r.URL.Path == "/config/cp_security.cgi" {
		c.handleBackup(w, r)
		return
	}
	if r.URL.Path == "/config/fileupload.ccc" {
		c.handleFileUpload(w, r)
		return
	}
	if r.URL.Path == "/config/cp_software.cgi" && r.Method == http.MethodPost {
		c.handleSoftware(w, r)
		return
	}
	if r.URL.Path == "/config/cp_maintenance.cgi" {
		c.handleMaintenance(w, r)
		return
	}
	if r.URL.Path == "/EULA.de" || r.URL.Path == "/EULA.en" {
		c.mu.Lock()
		staged := c.stagedFirmware
		c.mu.Unlock()
		if !strings.Contains(staged, FakeFirmwareEula) {
			http.NotFound(w, r)
			return
		}
		_, _ = io.WriteString(w, "Lizenzbedingungen der Fake-Firmware")
		return
	}
	var req struct {
		Method string                 `json:"method"`
		Params map[string]interface{} `json:"params"`
	}
	if err := jsonDecode(r.Body, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	switch req.Method {
	case "Session.login":
		c.mu.Lock()
		defer c.mu.Unlock()
		for _, user := range c.fixture.Users {
			if user.Name == fmt.Sprint(req.Params["username"]) && user.Password == fmt.Sprint(req.Params["password"]) {
				_, _ = io.WriteString(w, `{"version":"1.1","result":"fakeSession1","error":null}`)
				return
			}
		}
		_, _ = io.WriteString(w, `{"version":"1.1","result":null,"error":{"name":"JSONRPCError","code":501,"message":"invalid credentials"}}`)
	case "Session.logout":
		_, _ = io.WriteString(w, `{"version":"1.1","result":true,"error":null}`)
	case "CCU.setSSH", "CCU.setSSHPassword", "CCU.setSNMPEnabled", "CCU.restartSSHDaemon", "CCU.setAuthEnabled", "CCU.setHttpsRedirectEnabled", "User.restartLighttpd", "User.existsCertificate", "BidCoS_RF.isKeySet", "BidCoS_RF.validateKey":
		if req.Params["_session_id_"] != "fakeSession1" {
			_, _ = io.WriteString(w, `{"version":"1.1","result":null,"error":{"name":"JSONRPCError","code":400,"message":"access denied"}}`)
			return
		}
		_, _ = io.WriteString(w, c.securityMethod(req.Method, req.Params))
	case "CCU.setSecurityLevel":
		if req.Params["_session_id_"] != "fakeSession1" {
			_, _ = io.WriteString(w, `{"version":"1.1","result":null,"error":{"name":"JSONRPCError","code":400,"message":"access denied"}}`)
			return
		}
		_, _ = io.WriteString(w, c.setSecurityLevel(fmt.Sprint(req.Params["level"])))
	case "CCU.downloadFirmware":
		// OpenCCU's downloadFirmware.tcl: wget of the newest release to
		// /usr/local/tmp/firmwareUpdateFile
		if req.Params["_session_id_"] != "fakeSession1" {
			_, _ = io.WriteString(w, `{"version":"1.1","result":null,"error":{"name":"JSONRPCError","code":400,"message":"access denied"}}`)
			return
		}
		c.mu.Lock()
		c.calls["JSON-RPC CCU.downloadFirmware"]++
		c.mu.Unlock()
		ok := c.FirmwareDownloadFile != "" && os.WriteFile(c.FirmwareDownloadFile, []byte(FakeFirmwareDownload), 0o644) == nil
		_, _ = fmt.Fprintf(w, `{"version":"1.1","result":%t,"error":null}`, ok)
	case "Firewall.setConfiguration":
		if req.Params["_session_id_"] != "fakeSession1" {
			_, _ = io.WriteString(w, `{"version":"1.1","result":null,"error":{"name":"JSONRPCError","code":400,"message":"access denied"}}`)
			return
		}
		_, _ = io.WriteString(w, c.setFirewall(req.Params))
	case "BidCoS_RF.setConfigurationRF", "BidCoS_Wired.setConfigurationWired", "BidCoS.changeLanGatewayKey":
		if req.Params["_session_id_"] != "fakeSession1" {
			_, _ = io.WriteString(w, `{"version":"1.1","result":null,"error":{"name":"JSONRPCError","code":400,"message":"access denied"}}`)
			return
		}
		_, _ = io.WriteString(w, c.lanGatewayMethod(req.Method, req.Params))
	default:
		_, _ = io.WriteString(w, `{"version":"1.1","result":null,"error":{"code":404,"message":"unknown method"}}`)
	}
}

// FakeBackup is the content of every backup the fake CCU creates
const FakeBackup = "fake CCU backup (usr_local.tar.gz, signature, key_index, firmware_version)"

// handleBackup is the WebUI's "create backup" button: with a valid session
// it sends a .sbk file, otherwise the login page.
func (c *CCU) handleBackup(w http.ResponseWriter, r *http.Request) {
	// Like the WebUI, which looks for the session in the raw query
	if strings.Contains(r.URL.RawQuery, "sid=@fakeSession1@") && r.Method == http.MethodPost {
		if r.FormValue("action") == "change_key" {
			c.changeKey(w, r.FormValue("key1"), r.FormValue("key2"))
			return
		}
		if r.FormValue("action") == "factory_reset_go" {
			c.factoryReset(w, r.FormValue("key"))
			return
		}
		c.handleRestoreAction(w, r.FormValue("action"), r.FormValue("key"), r.FormValue("filename"))
		return
	}
	c.mu.Lock()
	c.calls["WebUI create_backup"]++
	c.mu.Unlock()
	if !strings.Contains(r.URL.RawQuery, "sid=@fakeSession1@") || r.URL.Query().Get("action") != "create_backup" {
		w.Header().Set("Content-Type", "text/html")
		_, _ = io.WriteString(w, "<html><body>Session expired</body></html>")
		return
	}
	// Headers as in the WebUI's backup.tcl
	w.Header().Set("Content-Type", "application/x-download")
	w.Header().Set("Content-Disposition", "attachment;filename=ccu3-webui-2026-10-03.sbk")
	_, _ = io.WriteString(w, FakeBackup)
}

// The fake's backups to restore: FakeBackup is fine; with FakeBackupKeyed
// in it the backup needs the key FakeBackupKey, with FakeBackupNewer it is
// from a newer firmware
const (
	FakeBackupKeyed = "signed with a user key"
	FakeBackupKey   = "Schluessel1"
	FakeBackupNewer = "firmware_version 9.9.9"
)

// Where the fake's fileupload.ccc stores an upload (mktemp -p /usr/local/tmp)
const fakeTempFile = "/usr/local/tmp/tmp.Fake01"

// handleFileUpload is the WebUI's fileupload.ccc: one file, an admin
// session, then the action of the page in "url"
func (c *CCU) handleFileUpload(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=iso-8859-1")
	query := r.URL.Query()
	if r.Method != http.MethodPost {
		_, _ = io.WriteString(w, "ERROR: no POST request")
		return
	}
	if !strings.Contains(r.URL.RawQuery, "sid=@fakeSession1@") {
		_, _ = io.WriteString(w, "ERROR: no valid admin session id")
		return
	}
	valid := (query.Get("action") == "backup_upload" && query.Get("url") == "/config/cp_security.cgi") ||
		(query.Get("action") == "firmware_upload" && query.Get("url") == "/config/cp_maintenance.cgi") ||
		(query.Get("action") == "image_upload" && query.Get("url") == "/config/cp_software.cgi")
	field := "backup_file"
	if query.Get("action") != "backup_upload" {
		field = "firmware_file"
	}
	if !valid || r.ContentLength <= 0 {
		_, _ = io.WriteString(w, "ERROR: missing required URL parameters")
		return
	}
	file, _, err := r.FormFile(field)
	if err != nil {
		_, _ = io.WriteString(w, "ERROR: "+err.Error())
		return
	}
	data, _ := io.ReadAll(file)
	c.mu.Lock()
	c.tempUpload = string(data)
	c.calls["WebUI upload "+query.Get("action")]++
	c.mu.Unlock()
	// As fileupload.ccc: the page sends the browser on with the temp file
	_, _ = fmt.Fprintf(w, "<script>var url = '%s?sid=@fakeSession1@';\ndlgPopup.LoadFromFile(url, 'action=%s&filename=%s');</script>",
		query.Get("url"), query.Get("action"), fakeTempFile)
}

// handleRestoreAction answers cp_security.cgi's restore steps with the
// WebUI's untranslated ${...} texts
func (c *CCU) handleRestoreAction(w http.ResponseWriter, action, key, filename string) {
	w.Header().Set("Content-Type", "text/html; charset=iso-8859-1")
	c.mu.Lock()
	defer c.mu.Unlock()
	c.calls["WebUI "+action]++
	backup := c.uploadedBackup
	keyed := strings.Contains(backup, FakeBackupKeyed)
	switch action {
	case "backup_upload":
		// action_backup_upload moves the temp file to new_config.tar
		if filename == fakeTempFile && c.tempUpload != "" {
			c.uploadedBackup, c.tempUpload = c.tempUpload, ""
		}
		_, _ = io.WriteString(w, `<script>dlgPopup.LoadFromFile(url, "action=backup_restore_check");</script>`)
	case "backup_restore_check":
		// It unpacks new_config.tar and deletes it
		c.checkedBackup, c.uploadedBackup = "", ""
		if !strings.Contains(backup, FakeBackup) {
			_, _ = io.WriteString(w, `<div class="popupTitle">${dialogSettingsSecurityMessageSysBackupInvalidFileTitle}</div>`)
			return
		}
		c.checkedBackup = backup
		if keyed {
			_, _ = io.WriteString(w, `<div id="performUpdateTitle">${dialogSettingsSecurityMessageSysBackupPerformTitle}</div><input type="text" name="key" size="16" id="text_key" type="password">`)
		} else {
			_, _ = io.WriteString(w, `<div id="performUpdateTitle">${dialogSettingsSecurityMessageSysBackupPerformTitle}</div><input type=hidden name="key" value=dummy id="text_key"/>`)
		}
	case "backup_restore_go":
		// It works on what the check unpacked
		backup = c.checkedBackup
		keyed = strings.Contains(backup, FakeBackupKeyed)
		switch {
		case c.checkedBackup == "":
			_, _ = io.WriteString(w, `${dialogSettingsSecurityMessageSysBackupErrorTitle}`)
		case keyed && key != FakeBackupKey:
			_, _ = io.WriteString(w, `<div class="popupTitle">${dialogSettingsSecurityMessageSysBackupSecurityErrorTitle}</div>${dialogSettingsSecurityMessageSysBackupSecurityError2Content}`)
		case strings.Contains(backup, FakeBackupNewer):
			_, _ = io.WriteString(w, `<div class="popupTitle">${dialogSettingsSecurityMessageSysBackupFWUpdateNecessaryTitle}</div>`)
		default:
			c.restoredBackup = c.checkedBackup
			_, _ = io.WriteString(w, `<div class="popupTitle">${dialogSettingsSecurityMessageSysBackupRestartSystemTitle}</div>`)
		}
	case "reboot":
		if c.restoredBackup != "" {
			c.rebooted = true
		}
	}
}

// The fake's firmware files: with FakeFirmware in it a file is a firmware
// update, with FakeFirmwareEula also it has a licence text
const (
	FakeFirmware     = "fake CCU firmware update"
	FakeFirmwareEula = "with EULA"
	// What CCU.downloadFirmware downloads, as from GitHub
	FakeFirmwareDownload = FakeFirmware + " " + FakeFirmwareEula + " (OpenCCU release)"
)

// handleMaintenance answers cp_maintenance.cgi's firmware update steps
func (c *CCU) handleMaintenance(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=iso-8859-1")
	if !strings.Contains(r.URL.RawQuery, "sid=@fakeSession1@") || r.Method != http.MethodPost {
		_, _ = io.WriteString(w, "<html><body>Session expired</body></html>")
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	action := r.FormValue("action")
	c.calls["WebUI "+action]++
	switch action {
	case "firmware_upload":
		// action_firmware_upload checks the file and links it as
		// /usr/local/.firmwareUpdate
		next := "firmware_update_invalid"
		stage := func(file string) {
			if c.FirmwareStagedLink != "" {
				os.Remove(c.FirmwareStagedLink)
				_ = os.Symlink(file, c.FirmwareStagedLink)
			}
		}
		filename := r.FormValue("filename")
		if r.FormValue("directDownload") == "true" {
			// The file CCU.downloadFirmware stored
			if data, err := os.ReadFile(c.FirmwareDownloadFile); err == nil && strings.Contains(string(data), FakeFirmware) {
				c.stagedFirmware = string(data)
				next = "askCreateBackup"
				stage(c.FirmwareDownloadFile)
			} else {
				os.Remove(c.FirmwareDownloadFile)
			}
		} else if filename == fakeTempFile && strings.Contains(c.tempUpload, FakeFirmware) {
			c.stagedFirmware = c.tempUpload
			next = "askCreateBackup"
		} else if data, err := os.ReadFile(filename); filename != fakeTempFile && err == nil {
			// A file on the CCU's own disk, checked where it is; the WebUI
			// deletes an invalid one
			if strings.Contains(string(data), FakeFirmware) {
				c.stagedFirmware = string(data)
				next = "askCreateBackup"
				stage(filename)
			} else {
				os.Remove(filename)
			}
		}
		c.tempUpload = ""
		_, _ = fmt.Fprintf(w, `<script>dlgPopup.LoadFromFile(url, "action=%s");</script>`, next)
	case "update_start":
		if c.stagedFirmware != "" {
			c.installedFirmware, c.stagedFirmware = c.stagedFirmware, ""
			c.rebooted = true
		}
	case "firmware_update_cancel":
		// Removes the linked file, the link and a direct download
		c.stagedFirmware = ""
		if c.FirmwareStagedLink != "" {
			if target, err := os.Readlink(c.FirmwareStagedLink); err == nil {
				os.Remove(target)
			}
			os.Remove(c.FirmwareStagedLink)
		}
		if c.FirmwareDownloadFile != "" {
			os.Remove(c.FirmwareDownloadFile)
		}
	}
}

// The fake's add-ons: FakeAddon installs without reboot, with
// FakeAddonReboot in it the CCU reboots, anything else fails
const (
	FakeAddon       = "fake CCU add-on"
	FakeAddonReboot = "needs a reboot"
)

// handleSoftware answers cp_software.cgi's install steps; install_go as
// /bin/install_addon's exit status decides
func (c *CCU) handleSoftware(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=iso-8859-1")
	if !strings.Contains(r.URL.RawQuery, "sid=@fakeSession1@") {
		_, _ = io.WriteString(w, "<html><body>Session expired</body></html>")
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	switch r.FormValue("action") {
	case "image_upload":
		if r.FormValue("filename") == fakeTempFile {
			c.newAddon, c.tempUpload = c.tempUpload, ""
		}
		_, _ = io.WriteString(w, `<script>dlgPopup.LoadFromFile(url, "action=install_confirm");</script>`)
	case "install_go":
		addon := c.newAddon
		c.newAddon = ""
		switch {
		case !strings.Contains(addon, FakeAddon):
			_, _ = io.WriteString(w, `<div class="popupTitle">Error (2)</div>${dialogSettingsExtraSoftwareHintPerformInstallationFailure}`)
		case strings.Contains(addon, FakeAddonReboot):
			c.installedAddons = append(c.installedAddons, addon)
			c.rebooted = true
			_, _ = io.WriteString(w, `<div class="popupTitle">${dialogSettingsExtraSoftwareHintPerformInstallationTitle}</div>${dialogSettingsExtraSoftwareHintPerformInstallationContent}`)
		default:
			c.installedAddons = append(c.installedAddons, addon)
			_, _ = io.WriteString(w, `<div class="popupTitle">${dialogSettingsExtraSoftwareHintPerformInstallationTitle}</div>${dialogSettingsExtraSoftwareHintPerformInstallationContentNoReboot}`)
		}
	}
}

// InstalledAddons returns the add-on files installed
func (c *CCU) InstalledAddons() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]string(nil), c.installedAddons...)
}

// InstalledFirmware returns the firmware file the CCU rebooted to install
// SetDeviceField changes a field of a device description, e.g. the
// AVAILABLE_FIRMWARE the CCU offers it
func (c *CCU) SetDeviceField(iface, address, field string, value interface{}) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	data := c.fixture.Interfaces[iface]
	if data == nil {
		return false
	}
	for _, d := range data.Devices {
		if d["ADDRESS"] == address {
			d[field] = value
			return true
		}
	}
	return false
}

func (c *CCU) InstalledFirmware() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.installedFirmware
}

// RestoredBackup returns the backup restored and whether the CCU rebooted
func (c *CCU) RestoredBackup() (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.restoredBackup, c.rebooted
}

// --- XML-RPC --------------------------------------------------------------

func (c *CCU) handleXMLRPC(iface string, w http.ResponseWriter, r *http.Request) {
	method, params, err := decodeCall(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	result, fault := c.call(iface, method, params)
	if method == "updateFirmware" && c.FirmwareUpdateDelay > 0 {
		// rfd answers only after transferring and flashing (minutes)
		time.Sleep(c.FirmwareUpdateDelay)
	}
	w.Header().Set("Content-Type", "text/xml")
	if fault != "" {
		// "-7:text" sends fault code -7
		code := -1
		if prefix, text, ok := strings.Cut(fault, ":"); ok {
			if n, err := strconv.Atoi(prefix); err == nil {
				code, fault = n, text
			}
		}
		_, _ = w.Write(toLatin1(encodeFault(code, fault)))
		return
	}
	// The result may hold the fixture's own maps (listDevices, getParamset):
	// encoded under the lock, as another call may change them meanwhile
	c.mu.Lock()
	body := encodeResponse(result)
	c.mu.Unlock()
	_, _ = w.Write(toLatin1(body))
}

func paramAt(params []interface{}, i int) interface{} {
	if i < len(params) {
		return params[i]
	}
	return nil
}

func stringParam(params []interface{}, i int) string {
	if i < len(params) {
		s, _ := params[i].(string)
		return s
	}
	return ""
}

func (c *CCU) call(iface, method string, params []interface{}) (interface{}, string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.calls[iface+" "+method]++
	data := c.fixture.Interfaces[iface]
	if data == nil {
		data = &InterfaceData{}
		c.fixture.Interfaces[iface] = data
	}

	switch method {
	case "system.listMethods":
		return []string{"init", "ping", "listDevices", "getDeviceDescription", "getParamsetDescription", "getParamset",
			"putParamset", "setValue", "setMetadata", "setInstallMode", "getInstallMode", "deleteDevice", "getLinks", "addLink", "removeLink"}, ""
	case "setInstallMode":
		on, _ := params[0].(bool)
		seconds := 60
		if len(params) > 1 {
			if n, ok := params[1].(int); ok {
				seconds = n
			}
		}
		if on {
			c.installModeUntil[iface] = time.Now().Add(time.Duration(seconds) * time.Second)
		} else {
			delete(c.installModeUntil, iface)
		}
		return "", ""
	case "setInstallModeWithWhitelist":
		seconds, _ := paramAt(params, 1).(int)
		c.installModeUntil[iface] = time.Now().Add(time.Duration(seconds) * time.Second)
		c.Whitelist = nil
		list, _ := paramAt(params, 2).([]interface{})
		for _, item := range list {
			if entry, ok := item.(map[string]interface{}); ok {
				c.Whitelist = append(c.Whitelist, entry)
				// The device answers at once: into the inbox, its address
				// from the SGTIN
				if sgtin := fmt.Sprint(entry["ADDRESS"]); len(sgtin) == 24 {
					c.addInboxDevice(iface, sgtin[10:], "HmIP-PSM")
				}
			}
		}
		return "", ""
	case "addDevice":
		serial := stringParam(params, 0)
		if strings.HasPrefix(serial, "KEQ") && c.tempKey == "" {
			c.keyMismatch = serial
			return nil, "-7:key mismatch"
		}
		if strings.HasPrefix(serial, "KEQ") {
			// The temporary key served this device
			c.tempKey = ""
		}
		c.addInboxDevice(iface, serial, "HM-LC-Sw1-FM")
		c.calls["addDevice"]++
		return map[string]interface{}{"ADDRESS": serial, "TYPE": "HM-LC-Sw1-FM"}, ""
	case "getKeyMismatchDevice":
		serial := c.keyMismatch
		if b, _ := paramAt(params, 0).(bool); b {
			c.keyMismatch = ""
		}
		return serial, ""
	case "setTempKey":
		c.tempKey = stringParam(params, 0)
		return "", ""
	case "getInstallMode":
		remaining := time.Until(c.installModeUntil[iface])
		if remaining < 0 {
			remaining = 0
		}
		return int(remaining.Seconds()), ""
	case "installFirmware":
		// HmIP: the delivered firmware is installed (on a live update the
		// access point stays online: LIVE_UP_TO_DATE)
		address := stringParam(params, 0)
		for _, d := range data.Devices {
			if d["ADDRESS"] != address {
				continue
			}
			state, _ := d["FIRMWARE_UPDATE_STATE"].(string)
			switch state {
			case "READY_FOR_UPDATE", "DO_UPDATE_PENDING":
				d["FIRMWARE_UPDATE_STATE"] = "UP_TO_DATE"
			case "LIVE_NEW_FIRMWARE_AVAILABLE":
				d["FIRMWARE_UPDATE_STATE"] = "LIVE_UP_TO_DATE"
			default:
				return nil, "-5:Firmware update not ready"
			}
			d["FIRMWARE"] = d["AVAILABLE_FIRMWARE"]
			return true, ""
		}
		return nil, "-2:Unknown instance"
	case "refreshDeployedDeviceFirmwareList":
		c.refreshFirmware(iface, data)
		return true, ""
	case "updateFirmware":
		// BidCos: transfers and installs the firmware the CCU has. A device
		// that is not always listening (RX_MODE without ALWAYS) has to be
		// woken with its key; the fake one never is: fault -1, as the
		// WebUI's ic_ifacecmd.cgi expects it.
		address := stringParam(params, 0)
		for _, d := range data.Devices {
			if d["ADDRESS"] != address {
				continue
			}
			available, _ := d["AVAILABLE_FIRMWARE"].(string)
			if available == "" || available == d["FIRMWARE"] {
				return nil, "-5:No firmware update available"
			}
			rxMode := 1
			switch v := d["RX_MODE"].(type) {
			case float64:
				rxMode = int(v)
			case int:
				rxMode = v
			}
			if rxMode&1 == 0 {
				return nil, "-1:Bootloader in device " + address + " didn't start"
			}
			d["FIRMWARE"] = available
			// rfd answers a plain bool (XmlRpcMethods updateFirmware)
			return true, ""
		}
		return nil, "-2:Unknown instance"
	case "listReplaceableDevices":
		// Devices of the new device's type that are set up (not in the inbox)
		newAddress := stringParam(params, 0)
		var newType interface{}
		for _, d := range data.Devices {
			if d["ADDRESS"] == newAddress {
				newType = d["TYPE"]
			}
		}
		if newType == nil {
			return nil, "Unknown instance"
		}
		list := []interface{}{}
		for _, d := range data.Devices {
			if parent, _ := d["PARENT"].(string); parent == "" && d["TYPE"] == newType && d["ADDRESS"] != newAddress && !slices.Contains(c.fixture.Inbox, fmt.Sprint(d["ADDRESS"])) {
				list = append(list, d)
			}
		}
		return list, ""
	case "replaceDevice":
		if !c.replaceDevice(iface, stringParam(params, 0), stringParam(params, 1)) {
			return nil, "Unknown instance"
		}
		return "", ""
	case "deleteDevice":
		if !c.deleteDevice(iface, stringParam(params, 0)) {
			return nil, "Unknown instance"
		}
		return "", ""
	case "init":
		url, id := stringParam(params, 0), stringParam(params, 1)
		if c.callbacks[iface] == nil {
			c.callbacks[iface] = map[string]string{}
		}
		if id == "" {
			for existing, u := range c.callbacks[iface] {
				if u == url {
					delete(c.callbacks[iface], existing)
				}
			}
		} else {
			c.callbacks[iface][id] = url
		}
		return "", ""
	case "ping":
		id := stringParam(params, 0)
		if url, ok := c.callbacks[iface][id]; ok {
			c.events <- callbackEvent{url: url, interfaceID: id, address: "CENTRAL", datapoint: "PONG", value: id}
		}
		return true, ""
	case "listDevices":
		if data.RadioInterfaces != nil {
			// BidCos-RF devices carry their radio module, at first the
			// default one
			for _, d := range data.Devices {
				if d["PARENT"] == nil && d["INTERFACE"] == nil {
					for _, m := range data.RadioInterfaces {
						if m["DEFAULT"] == true {
							d["INTERFACE"], d["ROAMING"] = m["ADDRESS"], 0
						}
					}
				}
			}
		}
		if c.Lite {
			// The central's own virtual keys, as rfd and HMIPServer list them
			return append(append([]map[string]interface{}{}, data.Devices...), c.virtualKeyDevices(iface)...), ""
		}
		return data.Devices, ""
	case "setBidcosInterface":
		roaming := 0
		if b, _ := paramAt(params, 2).(bool); b {
			roaming = 1
		}
		for _, d := range data.Devices {
			if d["ADDRESS"] == stringParam(params, 0) {
				d["INTERFACE"], d["ROAMING"] = stringParam(params, 1), roaming
				c.calls["setBidcosInterface"]++
				return true, ""
			}
		}
		return nil, "Unknown instance"
	case "setMetadata":
		if c.metadata[iface] == nil {
			c.metadata[iface] = map[string]interface{}{}
		}
		c.metadata[iface][stringParam(params, 0)+"/"+stringParam(params, 1)] = paramAt(params, 2)
		return "", ""
	case "searchDevices":
		// hs485d looks for new devices on the RS485 bus; they land in the
		// inbox (cp_add_device.cgi action_wir_search)
		if iface != "BidCos-Wired" {
			return nil, "Unknown method"
		}
		c.addInboxDevice(iface, fmt.Sprintf("LEQ%07d", 9100000+len(c.fixture.Inbox)), "HMW-LC-Sw2-DR")
		return 1, ""
	case "getDeviceDescription":
		for _, d := range data.Devices {
			if d["ADDRESS"] == stringParam(params, 0) {
				return d, ""
			}
		}
		return nil, "Unknown instance"
	case "getParamsetDescription":
		address, key := stringParam(params, 0), stringParam(params, 1)
		description, ok := data.ParamsetDescriptions[address][key]
		if !ok && c.Lite && isVirtualKey(address) && key == "VALUES" {
			description, ok = virtualKeyValues, true
		}
		if !ok && strings.Contains(key, ":") {
			// Link parameters: the same for every partner
			description, ok = data.ParamsetDescriptions[address]["LINK"]
		}
		if !ok {
			return nil, "Unknown paramset"
		}
		if description == nil {
			// Older exports wrote empty paramsets as null
			description = map[string]interface{}{}
		}
		return description, ""
	case "getParamset":
		address, key := stringParam(params, 0), stringParam(params, 1)
		if key == "VALUES" {
			if ch := c.channelByAddress(iface, address); ch != nil {
				return ch.Datapoints, ""
			}
		}
		if values, ok := data.Paramsets[address][key]; ok {
			return values, ""
		}
		if description, ok := data.ParamsetDescriptions[address]["LINK"]; ok && strings.Contains(key, ":") {
			defaults := map[string]interface{}{}
			for name, raw := range description {
				if p, ok := raw.(map[string]interface{}); ok {
					defaults[name] = p["DEFAULT"]
				}
			}
			return defaults, ""
		}
		return nil, "Unknown paramset"
	case "logLevel":
		if c.rpcLogLevels == nil {
			c.rpcLogLevels = map[string]int{}
		}
		if len(params) > 0 {
			level, ok := params[0].(int)
			if !ok {
				return nil, "logLevel expects an integer"
			}
			c.rpcLogLevels[iface] = level
			return level, ""
		}
		if level, ok := c.rpcLogLevels[iface]; ok {
			return level, ""
		}
		return 2, ""
	case "listBidcosInterfaces":
		if data.RadioInterfaces == nil {
			return nil, "Unknown method listBidcosInterfaces"
		}
		return append(append([]map[string]interface{}{}, data.RadioInterfaces...), c.lanGatewayModules(iface)...), ""
	case "getLinks":
		address := stringParam(params, 0)
		links := []interface{}{}
		for _, link := range data.Links {
			for _, end := range []interface{}{link["SENDER"], link["RECEIVER"]} {
				// An empty address asks for all links
				if address == "" || end == address || deviceAddress(fmt.Sprint(end)) == address {
					links = append(links, link)
					break
				}
			}
		}
		return links, ""
	case "addLink":
		data.Links = append(data.Links, map[string]interface{}{
			"SENDER": stringParam(params, 0), "RECEIVER": stringParam(params, 1),
			"NAME": stringParam(params, 2), "DESCRIPTION": stringParam(params, 3), "FLAGS": 0,
		})
		return "", ""
	case "removeLink":
		kept := data.Links[:0]
		removed := false
		for _, link := range data.Links {
			if link["SENDER"] == stringParam(params, 0) && link["RECEIVER"] == stringParam(params, 1) {
				removed = true
				continue
			}
			kept = append(kept, link)
		}
		data.Links = kept
		if !removed {
			return nil, "Unknown link"
		}
		return "", ""
	case "setValue":
		ch := c.channelByAddress(iface, stringParam(params, 0))
		if ch == nil || len(params) < 3 {
			return nil, "Unknown instance"
		}
		c.setValue(ch, stringParam(params, 1), params[2])
		return "", ""
	case "putParamset":
		address, key := stringParam(params, 0), stringParam(params, 1)
		values, _ := params[len(params)-1].(map[string]interface{})
		if key == "VALUES" {
			ch := c.channelByAddress(iface, address)
			if ch == nil {
				return nil, "Unknown instance"
			}
			for name, v := range values {
				c.setValue(ch, name, v)
			}
			return "", ""
		}
		if data.Paramsets == nil {
			data.Paramsets = map[string]map[string]map[string]interface{}{}
		}
		if data.Paramsets[address] == nil {
			data.Paramsets[address] = map[string]map[string]interface{}{}
		}
		if data.Paramsets[address][key] == nil {
			data.Paramsets[address][key] = map[string]interface{}{}
		}
		for name, v := range values {
			data.Paramsets[address][key][name] = v
		}
		if key == "MASTER" {
			c.markConfigPending(iface, deviceAddress(address))
		}
		return "", ""
	}
	return nil, "Unknown method " + method
}

// ConfigPendingFor is how long a device with a maintenance channel takes
// to fetch new settings
var ConfigPendingFor = 3 * time.Second

// markConfigPending sets CONFIG_PENDING on the device's channel 0 for a
// while after its settings changed, as a battery device that still has to
// fetch them; c.mu must be held
func (c *CCU) markConfigPending(iface, device string) {
	ch := c.channelByAddress(iface, device+":0")
	if ch == nil {
		return
	}
	if _, ok := ch.Datapoints["CONFIG_PENDING"]; !ok {
		return
	}
	c.setValue(ch, "CONFIG_PENDING", true)
	time.AfterFunc(ConfigPendingFor, func() {
		c.mu.Lock()
		defer c.mu.Unlock()
		c.setValue(ch, "CONFIG_PENDING", false)
	})
}

// sendEvents delivers events to the callbacks one at a time, in order, as
// system.multicall like the CCU.
func (c *CCU) sendEvents() {
	client := &http.Client{Timeout: 5 * time.Second}
	for e := range c.events {
		call := encodeCall("system.multicall", []interface{}{
			map[string]interface{}{
				"methodName": "event",
				"params":     []interface{}{e.interfaceID, e.address, e.datapoint, e.value},
			},
		})
		resp, err := client.Post(e.url, "text/xml", bytes.NewReader(toLatin1(call)))
		if err == nil {
			resp.Body.Close()
		}
	}
}
