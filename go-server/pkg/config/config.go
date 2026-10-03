package config

import (
	"log"
	"os"
	"path/filepath"
	"strconv"
)

type Config struct {
	WSPort     int
	WSBindHost string
	RPCPort    int
	HmIPPort   int
	// VirtualDevicesPort is the interface of heating groups and other
	// virtual devices
	VirtualDevicesPort int
	RPCServerPort      int
	CCUHost            string
	CCUUser            string
	CCUPass            string
	Debug              bool
	CallbackHost       string
	RegaPort           int

	// AuthMode is "ccu" (log in with a CCU WebUI user) or "none".
	AuthMode string
	// WebUIURL is the CCU WebUI, whose JSON-RPC API verifies logins.
	WebUIURL string
	// AuthKeyFile holds the key that signs login tokens. It must not be
	// inside the addon directory, which lighttpd serves to the web.
	AuthKeyFile string
	// SessionsFile keeps the list of logged-in devices
	SessionsFile string
	// AuditLogFile records every change made through the add-on; empty
	// disables it.
	AuditLogFile string
	// BackupDir keeps created backups until they are downloaded; on the
	// CCU /tmp is in RAM, not on the flash memory being backed up.
	BackupDir string
}

func Load() *Config {
	ccuHost := getEnv("CCU_HOST", "localhost")

	regaPort := 8181
	if ccuHost == "localhost" {
		regaPort = 8183
	}

	return &Config{
		WSPort: getEnvInt("WS_PORT", 8088),
		// Only lighttpd (or the Vite dev proxy) needs to reach the
		// WebSocket server; it must not be reachable directly from the LAN.
		WSBindHost:         getEnv("WS_BIND_HOST", "127.0.0.1"),
		RPCPort:            getEnvInt("RPC_PORT", 2001),
		HmIPPort:           getEnvInt("HMIP_PORT", 2010),
		VirtualDevicesPort: getEnvInt("VIRTUAL_DEVICES_PORT", 9292),
		RPCServerPort:      getEnvInt("RPC_SERVER_PORT", 9099),
		CCUHost:            ccuHost,
		CCUUser:            getEnv("CCU_USER", ""),
		CCUPass:            getEnv("CCU_PASS", ""),
		Debug:              getEnv("DEBUG", "false") == "true",
		CallbackHost:       getEnv("CALLBACK_HOST", "127.0.0.1"),
		RegaPort:           getEnvInt("REGA_PORT", regaPort),
		AuthMode:           getEnv("AUTH_MODE", "ccu"),
		WebUIURL:           getEnv("CCU_WEBUI_URL", "http://"+ccuHost),
		AuthKeyFile:        getEnv("AUTH_KEY_FILE", defaultAuthKeyFile()),
		AuditLogFile:       getEnv("AUDIT_LOG_FILE", defaultConfigFile("mui-audit.log")),
		SessionsFile:       getEnv("SESSIONS_FILE", defaultConfigFile("mui-sessions.json")),
		BackupDir:          getEnv("BACKUP_DIR", filepath.Join(os.TempDir(), "mui-backups")),
	}
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
