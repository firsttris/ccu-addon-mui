package config

import (
	"os"
	"strconv"
)

type Config struct {
	WSPort        int
	RPCPort       int
	HmIPPort      int
	RPCServerPort int
	CCUHost       string
	CCUUser       string
	CCUPass       string
	Debug         bool
	CallbackHost  string
	RegaPort      int
}

func Load() *Config {
	ccuHost := getEnv("CCU_HOST", "localhost")
	
	regaPort := 8181
	if ccuHost == "localhost" {
		regaPort = 8183
	}

	return &Config{
		WSPort:        getEnvInt("WS_PORT", 8088),
		RPCPort:       getEnvInt("RPC_PORT", 2001),
		HmIPPort:      getEnvInt("HMIP_PORT", 2010),
		RPCServerPort: getEnvInt("RPC_SERVER_PORT", 9099),
		CCUHost:       ccuHost,
		CCUUser:       getEnv("CCU_USER", ""),
		CCUPass:       getEnv("CCU_PASS", ""),
		Debug:         getEnv("DEBUG", "false") == "true",
		CallbackHost:  getEnv("CALLBACK_HOST", "127.0.0.1"),
		RegaPort:      getEnvInt("REGA_PORT", regaPort),
	}
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
	}
	return defaultValue
}
