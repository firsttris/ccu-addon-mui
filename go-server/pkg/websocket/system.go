package websocket

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"ccu-addon-mui-server/pkg/atomicfile"
	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/sysinfo"
)

// Where the CCU (CCU3, OpenCCU) keeps its firmware version, as VERSION=...
var firmwareVersionFile = "/VERSION"

// addonVersion reads the add-on's VERSION file, which the installer puts
// next to the go-server directory.
func addonVersion() string {
	executable, err := os.Executable()
	if err != nil {
		return ""
	}
	data, err := os.ReadFile(filepath.Join(filepath.Dir(executable), "..", "VERSION"))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

func firmwareVersion() string {
	return versionFileValue("VERSION")
}

// versionFileValue reads KEY=value from the firmware's VERSION file
// (VERSION, PRODUCT and, on OpenCCU, PLATFORM)
func versionFileValue(key string) string {
	f, err := os.Open(firmwareVersionFile)
	if err != nil {
		return ""
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		if value, ok := strings.CutPrefix(strings.TrimSpace(scanner.Text()), key+"="); ok {
			return value
		}
	}
	return ""
}

type radioInterface struct {
	InterfaceName string `json:"interfaceName"`
	ccurpc.RadioInterface
}

type systemInfoResponse struct {
	Type            string           `json:"type"`
	RequestID       string           `json:"requestId,omitempty"`
	Success         bool             `json:"success"`
	AddonVersion    string           `json:"addonVersion,omitempty"`
	FirmwareVersion string           `json:"firmwareVersion,omitempty"`
	RadioInterfaces []radioInterface `json:"radioInterfaces"`
	// As the WebUI's help page (help.cgi): product and platform from
	// /VERSION, the ReGaHss version and, on the CCU, its system state
	Product   string        `json:"product,omitempty"`
	Platform  string        `json:"platform,omitempty"`
	RegaBuild string        `json:"regaBuild,omitempty"`
	System    *sysinfo.Info `json:"system,omitempty"`
}

// handleSystemInfo: versions and the radio modules with their duty cycle,
// for administrators.
func (s *Server) handleSystemInfo(client *Client, requestID string) {
	rpc := s.rpcFor(client)
	if client.level != auth.LevelAdmin {
		s.sendRequestError(client, requestID, "only administrators may see system information", "FORBIDDEN")
		return
	}
	response := systemInfoResponse{
		Type: "getSystemInfo_response", RequestID: requestID, Success: true,
		AddonVersion: addonVersion(), FirmwareVersion: firmwareVersion(), RadioInterfaces: []radioInterface{},
		Product: versionFileValue("PRODUCT"), Platform: versionFileValue("PLATFORM"),
	}
	if s.regaClient != nil {
		if build, err := s.regaClient.BuildLabel(); err == nil {
			response.RegaBuild = build
		}
	}
	// Only on the CCU itself: elsewhere it would describe the add-on's host
	if response.FirmwareVersion != "" {
		info := sysinfo.Read()
		response.System = &info
	}
	if s.rpc != nil {
		// The interfaces the WebUI asks for their modules (showAllInterfaces
		// in webui.js): the groups server (VirtualDevices) answers
		// listBidcosInterfaces with a fault the CCU logs in hmserver.log
		for _, iface := range []string{"BidCos-RF", "BidCos-Wired", "HmIP-RF"} {
			modules, err := rpc.ListBidcosInterfaces(iface)
			if err != nil {
				continue
			}
			for _, m := range modules {
				response.RadioInterfaces = append(response.RadioInterfaces, radioInterface{InterfaceName: iface, RadioInterface: m})
			}
		}
	}
	s.sendJSON(client, response)
}

// Where the WebUI keeps country, city, coordinates and time zone
// (cp_time.cgi, get_location_config)
var timeConfFile = "/etc/config/time.conf"

// What cp_maintenance.cgi runs after saving (action_reboot,
// action_shutdown); a shutdown first leaves /tmp/shutdown. The safe mode
// (SafeMode.enter, api/methods/safemode/enter.tcl) leaves safeModeFile
// first: OpenCCU then starts no add-ons (S55InitAddons, S98StartAddons),
// this one neither, and removes the file once up (S99SetupLEDs).
var powerCommands = map[string][][]string{
	"reboot":   {{"/sbin/reboot"}},
	"shutdown": {{"touch", "/tmp/shutdown"}, {"/sbin/poweroff"}},
	"safemode": {{"/sbin/reboot"}},
}

var safeModeFile = "/etc/config/safemode"

// The logic layer ReGaHss starts as (S70ReGaHss): /etc/config/ReGaHssVersion
// picks /bin/ReGaHss.normal ("Kompatibilitätsmodus") or
// /bin/ReGaHss.community ("Standard"). The eQ-3 firmware ships both and
// its maintenance page chooses (cp_maintenance.cgi, User.getReGaVersion,
// User.setReGaVersion); OpenCCU ships one ReGaHss and removed the choice
// (patch 0008-WebUI-Disable-ReGa).
var (
	regaVersionFile = "/etc/config/ReGaHssVersion"
	regaBinaries    = map[string]string{"NORMAL": "/bin/ReGaHss.normal", "COMMUNITY": "/bin/ReGaHss.community"}
)

// regaVersion reads the choice as getregaversion.tcl (none or LEGACY:
// COMMUNITY); "" where the CCU has not both binaries
func regaVersion() string {
	for _, binary := range regaBinaries {
		if _, err := os.Stat(binary); err != nil {
			return ""
		}
	}
	data, _ := os.ReadFile(regaVersionFile)
	version := strings.TrimSpace(strings.SplitN(string(data), "\n", 2)[0])
	if _, ok := regaBinaries[version]; !ok {
		return "COMMUNITY"
	}
	return version
}

// powerAvailable: the add-on runs on the CCU itself, which only the
// firmware's VERSION file and the commands tell.
var powerAvailable = func() bool {
	if firmwareVersion() == "" {
		return false
	}
	_, err := os.Stat("/sbin/reboot")
	return err == nil
}

// runPower runs the commands after a moment, so the answer still goes out
var runPower = func(action string) {
	time.AfterFunc(2*time.Second, func() {
		for _, command := range powerCommands[action] {
			if err := exec.Command(command[0], command[1:]...).Run(); err != nil {
				logger.Error("Failed to run", command[0]+":", err)
			}
		}
	})
}

var timeConfLine = regexp.MustCompile(`(?m)^\s*([A-Z]+)\s*=\s*'?([^'\n]*)'?\s*$`)

// readTimeConf reads time.conf as get_location_config does; nil without it
func readTimeConf() map[string]string {
	data, err := os.ReadFile(timeConfFile)
	if err != nil {
		return nil
	}
	values := map[string]string{}
	for _, match := range timeConfLine.FindAllStringSubmatch(string(data), -1) {
		values[match[1]] = match[2]
	}
	return values
}

// writeTimeConfLocation keeps time.conf's coordinates in step with ReGa, as
// set_location_config writes both; only when the file exists.
func writeTimeConfLocation(latitude, longitude float64) error {
	values := readTimeConf()
	if values == nil {
		return nil
	}
	values["LATITUDE"], values["LONGITUDE"] = rega.FormatCoordinate(latitude), rega.FormatCoordinate(longitude)
	var b strings.Builder
	for _, key := range []string{"COUNTRY", "CITY", "LATITUDE", "LONGITUDE", "TIMEZONE"} {
		b.WriteString(key + "=" + values[key] + "\n")
	}
	return atomicfile.Write(timeConfFile, []byte(b.String()), 0o644)
}

type systemSettingsResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	rega.SystemSettings
	// From time.conf, if there
	TimeZone string `json:"timeZone,omitempty"`
	City     string `json:"city,omitempty"`
	// Whether reboot and shutdown work (the add-on runs on the CCU)
	CanPower bool `json:"canPower"`
	// The time servers (ntpclient), if the file is there
	TimeServers *string `json:"timeServers,omitempty"`
	// The time zones to choose from, if time.conf is there
	TimeZones []string `json:"timeZones,omitempty"`
	// Whether the clock can be set by hand (on the CCU)
	CanSetClock bool `json:"canSetClock"`
	// The chosen logic layer, where the CCU has both (regaVersion)
	RegaVersion string `json:"regaVersion,omitempty"`
}

// handleSystemSettings reads the location and clock, sets the location
// (as cp_time.cgi) or reboots or shuts down the CCU (as cp_maintenance.cgi).
// Administrators only.
func (s *Server) handleSystemSettings(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string   `json:"requestId"`
		Latitude  *float64 `json:"latitude"`
		Longitude *float64 `json:"longitude"`
		Action    string   `json:"action"`
		// setTimeServers, setTimeZone, setClock ("2026-10-04 12:30:00")
		Servers  string `json:"servers"`
		TimeZone string `json:"timeZone"`
		Time     string `json:"time"`
		// setRegaVersion
		Version string `json:"version"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	switch msgType {
	case "getSystemSettings":
		if client.level != auth.LevelAdmin {
			s.sendRequestError(client, msg.RequestID, "only administrators may see system settings", "FORBIDDEN")
			return
		}
		settings, err := s.regaClient.GetSystemSettings()
		if err != nil {
			s.sendRequestError(client, msg.RequestID, "getSystemSettings failed: "+err.Error(), "CCU_ERROR")
			return
		}
		response := systemSettingsResponse{
			Type: "getSystemSettings_response", RequestID: msg.RequestID, SystemSettings: settings,
			CanPower: powerAvailable(), CanSetClock: clockAvailable(),
		}
		if conf := readTimeConf(); conf != nil {
			response.TimeZone, response.City = conf["TIMEZONE"], conf["CITY"]
			response.TimeZones = timeZoneList()
		}
		if servers, ok := readTimeServers(); ok {
			response.TimeServers = &servers
		}
		response.RegaVersion = regaVersion()
		s.sendJSON(client, response)
	case "setLocation":
		if msg.Latitude == nil || msg.Longitude == nil {
			s.sendRequestError(client, msg.RequestID, "latitude and longitude are required", "INVALID_REQUEST")
			return
		}
		latitude, longitude := *msg.Latitude, *msg.Longitude
		s.configure(client, msg.RequestID, audit.Entry{Action: "setLocation", Target: "system", Value: rega.FormatCoordinate(latitude) + "," + rega.FormatCoordinate(longitude)},
			func() (interface{}, string, error) {
				var previous interface{}
				if settings, err := s.regaClient.GetSystemSettings(); err == nil {
					previous = rega.FormatCoordinate(settings.Latitude) + "," + rega.FormatCoordinate(settings.Longitude)
				}
				result, err := s.regaClient.SetLocation(latitude, longitude)
				if err == nil && result == rega.SetOK {
					if err := writeTimeConfLocation(latitude, longitude); err != nil {
						logger.Error("Failed to write", timeConfFile+":", err)
					}
				}
				return previous, result, err
			})
	case "setTimeServers":
		// cp_time.cgi action_apply_timeserver
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: "system", Value: msg.Servers},
			func() (interface{}, string, error) {
				previous, ok := readTimeServers()
				if !ok {
					return nil, "NOT_SUPPORTED", nil
				}
				if err := writeTimeServers(msg.Servers); err != nil {
					return nil, "", err
				}
				afterClockChange([]string{"setclock", "noloop"}, []string{"SetInterfaceClock", rfdAddress()})
				return previous, rega.SetOK, nil
			})
	case "setTimeZone":
		// cp_time.cgi action_apply_position: time.conf, TZ, updateTZ.sh
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: "system", Value: msg.TimeZone},
			func() (interface{}, string, error) {
				conf := readTimeConf()
				if conf == nil {
					return nil, "NOT_SUPPORTED", nil
				}
				if err := writeTimeZone(msg.TimeZone); err != nil {
					return nil, "", err
				}
				afterClockChange([]string{"/bin/updateTZ.sh"}, []string{"/sbin/hwclock", "-wu"}, []string{"SetInterfaceClock", rfdAddress()})
				if err := s.regaClient.ClockStep("changed"); err != nil {
					logger.Error("Failed to tell ReGa about the new time zone:", err)
				}
				return conf["TIMEZONE"], rega.SetOK, nil
			})
	case "setClock":
		// cp_time.cgi action_apply_time
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: "system", Value: msg.Time},
			func() (interface{}, string, error) {
				t, err := parseClock(msg.Time)
				if err != nil {
					return nil, "", err
				}
				if !clockAvailable() {
					return nil, "NOT_SUPPORTED", nil
				}
				if err := s.regaClient.ClockStep("setting"); err != nil {
					return nil, "", err
				}
				if err := runClock("date", "-s", t.Format("200601021504.05")); err != nil {
					return nil, "", err
				}
				if err := s.regaClient.ClockStep("changed"); err != nil {
					return nil, "", err
				}
				afterClockChange([]string{"/sbin/hwclock", "-wu"}, []string{"SetInterfaceClock", rfdAddress()})
				return nil, rega.SetOK, nil
			})
	case "setRegaVersion":
		s.configure(client, msg.RequestID, audit.Entry{Action: "setRegaVersion", Target: "system", Value: msg.Version},
			func() (interface{}, string, error) {
				previous := regaVersion()
				if previous == "" {
					return nil, "NOT_SUPPORTED", nil
				}
				if msg.Version != "NORMAL" && msg.Version != "COMMUNITY" {
					return nil, "", fmt.Errorf("invalid version %q", msg.Version)
				}
				// setregaversion.tcl: echo $ReGaVersion > /etc/config/ReGaHssVersion
				return previous, rega.SetOK, os.WriteFile(regaVersionFile, []byte(msg.Version+"\n"), 0o644)
			})
	case "powerAction":
		if _, ok := powerCommands[msg.Action]; !ok {
			s.sendRequestError(client, msg.RequestID, "unknown action", "INVALID_REQUEST")
			return
		}
		ran := false
		s.configure(client, msg.RequestID, audit.Entry{Action: "powerAction", Target: "system", Value: msg.Action},
			func() (interface{}, string, error) {
				// Only where the add-on runs on the CCU itself
				if !powerAvailable() {
					return nil, "NOT_SUPPORTED", nil
				}
				result, err := s.regaClient.SaveSystem()
				if err == nil && result == rega.SetOK && msg.Action == "safemode" {
					// enter.tcl writes "1"
					err = os.WriteFile(safeModeFile, []byte("1\n"), 0o644)
				}
				ran = err == nil && result == rega.SetOK
				return nil, result, err
			})
		if ran {
			runPower(msg.Action)
		}
	}
}
