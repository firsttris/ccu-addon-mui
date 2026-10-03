package websocket

import (
	"bufio"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
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
}

// handleSystemInfo: versions and the radio modules with their duty cycle,
// for administrators.
func (s *Server) handleSystemInfo(client *Client, requestID string) {
	if client.level != auth.LevelAdmin {
		s.sendRequestError(client, requestID, "only administrators may see system information", "FORBIDDEN")
		return
	}
	response := systemInfoResponse{
		Type: "getSystemInfo_response", RequestID: requestID, Success: true,
		AddonVersion: addonVersion(), FirmwareVersion: firmwareVersion(), RadioInterfaces: []radioInterface{},
	}
	if s.rpc != nil {
		for _, iface := range s.rpc.InterfaceNames() {
			// Not every interface has radio modules (VirtualDevices)
			modules, err := s.rpc.ListBidcosInterfaces(iface)
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
// action_shutdown); a shutdown first leaves /tmp/shutdown.
var powerCommands = map[string][][]string{
	"reboot":   {{"/sbin/reboot"}},
	"shutdown": {{"touch", "/tmp/shutdown"}, {"/sbin/poweroff"}},
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
	return os.WriteFile(timeConfFile, []byte(b.String()), 0o644)
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
		response := systemSettingsResponse{Type: "getSystemSettings_response", RequestID: msg.RequestID, SystemSettings: settings, CanPower: powerAvailable()}
		if conf := readTimeConf(); conf != nil {
			response.TimeZone, response.City = conf["TIMEZONE"], conf["CITY"]
		}
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
				ran = err == nil && result == rega.SetOK
				return nil, result, err
			})
		if ran {
			runPower(msg.Action)
		}
	}
}
