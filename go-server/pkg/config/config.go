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
	// WWWDir is the CCU's WebUI directory, for its device pictures
	WWWDir string
	// AppDir is where the add-on's app is installed; the server delivers
	// its assets/ gzip-compressed (assets.go)
	AppDir string
	// RulesFile keeps the notification rules
	RulesFile string
	// PushSubject is the contact sent to the push services (VAPID "sub")
	PushSubject string
	// AddonsDir holds the add-on scripts (the WebUI's Zusatzsoftware)
	AddonsDir string
	// SyslogConfig holds the logging settings, LogDir the log files
	// (the WebUI's Zentralen-Wartung)
	SyslogConfig string
	LogDir       string
	// LogFile is the server's own log (its stderr, see rc.d/mui), turned
	// over at LogMaxBytes; "" leaves it alone
	LogFile     string
	LogMaxBytes int64
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
	// BackupDir keeps created backups until they are downloaded, and
	// uploaded backups and add-ons until they are installed. On the CCU it
	// is /usr/local/tmp/mui-backups: /tmp is a RAM disk, where a backup of
	// some hundred MB would starve ReGa; the WebUI keeps its backups in
	// /usr/local/tmp as well (createBackup.sh), which it leaves out of the
	// backup, and cp_security.cgi only clears the files directly in it.
	BackupDir string
	// DeviceFirmwareServer is eQ-3's update server, which lists and serves
	// the newest device firmware (webui.js homematic.com: m_URLServer,
	// downloadURLServer)
	DeviceFirmwareServer string
	// UserFSDir is the CCU's user partition, which needs room for a
	// firmware update (cp_maintenance.cgi: df -m /usr/local)
	UserFSDir string
	// FirmwareDownloadFile is where OpenCCU's CCU.downloadFirmware stores
	// the downloaded update (/usr/local/tmp/firmwareUpdateFile)
	FirmwareDownloadFile string
	// FirmwareUploadDir is where an uploaded CCU firmware is stored for the
	// WebUI to check: on the user partition, where fileupload.ccc puts it
	// too (mktemp -p /usr/local/tmp); /tmp is a RAM disk on OpenCCU, too
	// small for an image
	FirmwareUploadDir string
	// FirmwareStagedLink points to the update the recovery system installs
	// (action_firmware_upload: ln -sfn <file> /usr/local/.firmwareUpdate)
	FirmwareStagedLink string
	// CcuFirmwareReleases is where OpenCCU's releases and their SHA256
	// files are (checkFirmwareUpdate.sh)
	CcuFirmwareReleases string
	// AddonReleaseURL is the newest release of this add-on (GitHub's API),
	// AddonUpdateDir where it is unpacked to update without a reboot: the
	// user partition, as /bin/install_addon does (/usr/local/tmp)
	AddonReleaseURL string
	AddonUpdateDir  string
	// DataDir holds the add-on's own data on openccu-lite (DATA_DIR); empty
	// on a CCU, where it is spread as above
	DataDir string
	// openccu-lite: occulited behind the system's web server, and the
	// add-on's own API token (minted at every start with the manifest's
	// api_scopes)
	OcculiteURL       string
	OcculiteTokenFile string
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
		RulesFile:            getEnv("RULES_FILE", defaultConfigFile("mui-rules.json")),
		WWWDir:               getEnv("CCU_WWW_DIR", "/www"),
		AppDir:               getEnv("APP_DIR", "/usr/local/addons/mui"),
		PushSubject:          getEnv("PUSH_SUBJECT", "https://github.com/firsttris/ccu-addon-mui"),
		AddonsDir:            getEnv("ADDONS_DIR", "/etc/config/rc.d"),
		SyslogConfig:         getEnv("SYSLOG_CONFIG", "/etc/config/syslog"),
		LogDir:               getEnv("LOG_DIR", "/var/log"),
		LogFile:              getEnv("LOG_FILE", ""),
		LogMaxBytes:          int64(getEnvInt("LOG_MAX_BYTES", 1<<20)),
		TimeConfFile:         getEnv("TIME_CONF_FILE", "/etc/config/time.conf"),
		NTPClientFile:        getEnv("NTP_CLIENT_FILE", "/etc/config/ntpclient"),
		TZFile:               getEnv("TZ_FILE", "/etc/config/TZ"),
		GroupsFile:           getEnv("GROUPS_FILE", "/etc/config/groups.gson"),
		ConfigDir:            getEnv("CCU_CONFIG_DIR", "/etc/config"),
		StatusDir:            getEnv("CCU_STATUS_DIR", "/var/status"),
		DiagramsFile:         getEnv("DIAGRAMS_FILE", defaultConfigFile("mui-diagrams.json")),
		DiagramsDir:          getEnv("DIAGRAMS_DIR", defaultDataDir("mui-diagrams")),
		BackupDir:            getEnv("BACKUP_DIR", defaultBackupDir()),
		DeviceFirmwareServer: getEnv("DEVICE_FIRMWARE_SERVER", "https://ccu3-update.homematic.com"),
		UserFSDir:            getEnv("USERFS_DIR", "/usr/local"),
		FirmwareDownloadFile: getEnv("FIRMWARE_DOWNLOAD_FILE", "/usr/local/tmp/firmwareUpdateFile"),
		FirmwareUploadDir:    getEnv("FIRMWARE_UPLOAD_DIR", "/usr/local/tmp"),
		FirmwareStagedLink:   getEnv("FIRMWARE_STAGED_LINK", "/usr/local/.firmwareUpdate"),
		CcuFirmwareReleases:  getEnv("CCU_FIRMWARE_RELEASES", "https://github.com/openccu/openccu/releases/download"),
		AddonReleaseURL:      getEnv("ADDON_RELEASE_URL", "https://api.github.com/repos/firsttris/ccu-addon-mui/releases/latest"),
		AddonUpdateDir:       getEnv("ADDON_UPDATE_DIR", "/usr/local/tmp"),
		DataDir:              os.Getenv(dataDirEnv),
		OcculiteURL:          getEnv("OCCULITE_URL", "http://127.0.0.1"),
		OcculiteTokenFile:    getEnv("OCCULITE_TOKEN_FILE", "/run/occulite/addon-tokens/mui.api"),
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

// dataDirEnv names one directory for all the add-on's own data. On
// openccu-lite the add-on may write only its own directories
// (/usr/local/etc/config/addons/mui), on a CCU it is unset.
const dataDirEnv = "DATA_DIR"

func defaultConfigFile(name string) string {
	if dir := os.Getenv(dataDirEnv); dir != "" {
		return filepath.Join(dir, name)
	}
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
	if dir := os.Getenv(dataDirEnv); dir != "" {
		return filepath.Join(dir, name)
	}
	const ccuDataDir = "/usr/local"
	if info, err := os.Stat("/usr/local/etc/config"); err == nil && info.IsDir() {
		return ccuDataDir + "/" + name
	}
	return name
}

// defaultBackupDir is on the CCU's user partition, or in the system's
// temporary directory when running locally.
func defaultBackupDir() string {
	const ccuTmpDir = "/usr/local/tmp"
	if info, err := os.Stat(ccuTmpDir); err == nil && info.IsDir() {
		return ccuTmpDir + "/mui-backups"
	}
	return filepath.Join(os.TempDir(), "mui-backups")
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
