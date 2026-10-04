package config

import (
	"encoding/xml"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"time"
)

type Config struct {
	WSPort     int
	WSBindHost string
	RPCPort    int
	HmIPPort   int
	// VirtualDevicesPort is the interface of heating groups and other
	// virtual devices
	VirtualDevicesPort int
	// WiredPort is hs485d (BidCos-Wired); 0 when no Wired gateway is set up
	WiredPort     int
	RPCServerPort int
	CCUHost       string
	CCUUser       string
	CCUPass       string
	Debug         bool
	CallbackHost  string
	RegaPort      int
	// SysvarInterval: how often the system variables are read while an app
	// shows them (they send no events)
	SysvarInterval time.Duration

	// AuthMode is "ccu" (log in with a CCU WebUI user) or "none".
	AuthMode string
	// WebUIURL is the CCU WebUI, whose JSON-RPC API verifies logins.
	WebUIURL string
	// AuthKeyFile holds the key that signs login tokens. It must not be
	// inside the addon directory, which lighttpd serves to the web.
	AuthKeyFile string
	// SessionsFile keeps the list of logged-in devices
	SessionsFile string
	// PushFile keeps the Web Push key and the subscribed devices
	PushFile string
	// PushSubject is the contact sent to the push services (VAPID "sub")
	PushSubject string
	// AddonsDir holds the add-on scripts (the WebUI's Zusatzsoftware)
	AddonsDir string
	// SyslogConfig holds the logging settings, LogDir the log files
	// (the WebUI's Zentralen-Wartung)
	SyslogConfig string
	LogDir       string
	// The clock's files (the WebUI's cp_time.cgi)
	TimeConfFile  string
	NTPClientFile string
	TZFile        string
	// The heating groups the HMServer keeps (groups.gson)
	GroupsFile string
	// ConfigDir holds the WebUI's general settings (energyPrice,
	// hss_led_info.conf, hideStickyUnreach, fieldTestActive)
	ConfigDir string
	// StatusDir holds the state files of the CCU processes (/var/status:
	// the connection state of the LAN gateways)
	StatusDir string
	// DiagramsFile keeps the diagrams, DiagramsDir their recorded values
	DiagramsFile string
	DiagramsDir  string
	// AuditLogFile records every change made through the add-on; empty
	// disables it.
	AuditLogFile string
	// BackupDir keeps created backups until they are downloaded; on the
	// CCU /tmp is in RAM, not on the flash memory being backed up.
	BackupDir string
	// DeviceFirmwareServer is eQ-3's update server, which lists and serves
	// the newest device firmware (webui.js homematic.com: m_URLServer,
	// downloadURLServer)
	DeviceFirmwareServer string
	// IDsFile holds the CCU's serial number, sent along with a download
	// (CCU.getSerial: /var/ids SerialNumber)
	IDsFile string
}

func Load() *Config {
	ccuHost := getEnv("CCU_HOST", "localhost")

	// From the LAN the services are reached through lighttpd's ports (2001,
	// 2010, 9292, 8181), which may require authentication. On the CCU the
	// add-on talks to the services directly on their own ports, as ReGa
	// does (InterfacesList.xml, webui_remoteapi.conf).
	regaPort, rpcPort, hmipPort, virtualDevicesPort, wiredPort := 8181, 2001, 2010, 9292, 0
	if ccuHost == "localhost" {
		regaPort = 8183
		ports := localInterfacePorts(interfacesListFile)
		rpcPort = portOr(ports["BidCos-RF"], 32001)
		hmipPort = portOr(ports["HmIP-RF"], 32010)
		virtualDevicesPort = portOr(ports["VirtualDevices"], 39292)
		// hs485dLoader lists BidCos-Wired only while a Wired gateway is set
		// up (hs485dLoader.cpp updateInterfacesXML)
		wiredPort = ports["BidCos-Wired"]
	}

	return &Config{
		WSPort: getEnvInt("WS_PORT", 8088),
		// Only lighttpd (or the Vite dev proxy) needs to reach the
		// WebSocket server; it must not be reachable directly from the LAN.
		WSBindHost:           getEnv("WS_BIND_HOST", "127.0.0.1"),
		RPCPort:              getEnvInt("RPC_PORT", rpcPort),
		HmIPPort:             getEnvInt("HMIP_PORT", hmipPort),
		VirtualDevicesPort:   getEnvInt("VIRTUAL_DEVICES_PORT", virtualDevicesPort),
		WiredPort:            getEnvInt("WIRED_PORT", wiredPort),
		RPCServerPort:        getEnvInt("RPC_SERVER_PORT", 9099),
		CCUHost:              ccuHost,
		CCUUser:              getEnv("CCU_USER", ""),
		CCUPass:              getEnv("CCU_PASS", ""),
		Debug:                getEnv("DEBUG", "false") == "true",
		CallbackHost:         getEnv("CALLBACK_HOST", "127.0.0.1"),
		RegaPort:             getEnvInt("REGA_PORT", regaPort),
		SysvarInterval:       time.Duration(getEnvInt("SYSVAR_INTERVAL", 5)) * time.Second,
		AuthMode:             getEnv("AUTH_MODE", "ccu"),
		WebUIURL:             getEnv("CCU_WEBUI_URL", "http://"+ccuHost),
		AuthKeyFile:          getEnv("AUTH_KEY_FILE", defaultAuthKeyFile()),
		AuditLogFile:         getEnv("AUDIT_LOG_FILE", defaultConfigFile("mui-audit.log")),
		SessionsFile:         getEnv("SESSIONS_FILE", defaultConfigFile("mui-sessions.json")),
		PushFile:             getEnv("PUSH_FILE", defaultConfigFile("mui-push.json")),
		PushSubject:          getEnv("PUSH_SUBJECT", "https://github.com/firsttris/ccu-addon-mui"),
		AddonsDir:            getEnv("ADDONS_DIR", "/etc/config/rc.d"),
		SyslogConfig:         getEnv("SYSLOG_CONFIG", "/etc/config/syslog"),
		LogDir:               getEnv("LOG_DIR", "/var/log"),
		TimeConfFile:         getEnv("TIME_CONF_FILE", "/etc/config/time.conf"),
		NTPClientFile:        getEnv("NTP_CLIENT_FILE", "/etc/config/ntpclient"),
		TZFile:               getEnv("TZ_FILE", "/etc/config/TZ"),
		GroupsFile:           getEnv("GROUPS_FILE", "/etc/config/groups.gson"),
		ConfigDir:            getEnv("CCU_CONFIG_DIR", "/etc/config"),
		StatusDir:            getEnv("CCU_STATUS_DIR", "/var/status"),
		DiagramsFile:         getEnv("DIAGRAMS_FILE", defaultConfigFile("mui-diagrams.json")),
		DiagramsDir:          getEnv("DIAGRAMS_DIR", defaultDataDir("mui-diagrams")),
		BackupDir:            getEnv("BACKUP_DIR", filepath.Join(os.TempDir(), "mui-backups")),
		DeviceFirmwareServer: getEnv("DEVICE_FIRMWARE_SERVER", "https://ccu3-update.homematic.com"),
		IDsFile:              getEnv("IDS_FILE", "/var/ids"),
	}
}

// interfacesListFile lists the interface processes and where ReGa reaches
// them, e.g. xmlrpc_bin://127.0.0.1:32001 for BidCos-RF.
var interfacesListFile = "/etc/config/InterfacesList.xml"

var urlPortRegex = regexp.MustCompile(`^[a-z_]+://[^/:]+:(\d+)`)

// localInterfacePorts reads the ports of the interface processes by name
// from InterfacesList.xml; empty if the file is missing (not on a CCU).
func localInterfacePorts(path string) map[string]int {
	ports := map[string]int{}
	data, err := os.ReadFile(path)
	if err != nil {
		return ports
	}
	var list struct {
		IPC []struct {
			Name string `xml:"name"`
			URL  string `xml:"url"`
		} `xml:"ipc"`
	}
	if err := xml.Unmarshal(data, &list); err != nil {
		log.Printf("Ignoring %s: %v", path, err)
		return ports
	}
	for _, ipc := range list.IPC {
		// url.Parse rejects the scheme xmlrpc_bin
		if m := urlPortRegex.FindStringSubmatch(ipc.URL); m != nil {
			if port, err := strconv.Atoi(m[1]); err == nil {
				ports[ipc.Name] = port
			}
		}
	}
	return ports
}

func portOr(port, fallback int) int {
	if port > 0 {
		return port
	}
	return fallback
}

// defaultAuthKeyFile uses the CCU's persistent config directory (kept across
// addon updates and included in CCU backups), or the working directory when
// running locally.
func defaultAuthKeyFile() string {
	return defaultConfigFile("mui-auth.key")
}

func defaultConfigFile(name string) string {
	const ccuConfigDir = "/usr/local/etc/config"
	if info, err := os.Stat(ccuConfigDir); err == nil && info.IsDir() {
		return ccuConfigDir + "/" + name
	}
	return name
}

// defaultDataDir is on the CCU's user partition (/usr/local, the SD card or
// flash), next to the config directory, or in the working directory when
// running locally.
func defaultDataDir(name string) string {
	const ccuDataDir = "/usr/local"
	if info, err := os.Stat("/usr/local/etc/config"); err == nil && info.IsDir() {
		return ccuDataDir + "/" + name
	}
	return name
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
		log.Printf("⚠️ Invalid value %q for %s, using default %d", value, key, defaultValue)
	}
	return defaultValue
}
