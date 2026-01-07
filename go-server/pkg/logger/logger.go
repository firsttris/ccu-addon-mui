package logger

import (
	"fmt"
	"log"

	"ccu-addon-mui-server/pkg/config"
)

var debugMode bool

// SetDebugMode enables or disables debug logging
func SetDebugMode(enabled bool) {
	debugMode = enabled
}

// Info logs informational messages
func Info(args ...interface{}) {
	log.Println(args...)
}

// Error logs error messages
func Error(args ...interface{}) {
	log.Println(args...)
}

// Debug logs debug messages if debug mode is enabled
func Debug(args ...interface{}) {
	if debugMode {
		log.Println(args...)
	}
}

// LogStartupInfo logs startup configuration
func LogStartupInfo(cfg *config.Config) {
	SetDebugMode(cfg.Debug)
	
	Info("🚀 WebSocket Server starting...")
	Info(fmt.Sprintf("   CCU Host: %s", cfg.CCUHost))
	Info(fmt.Sprintf("   Callback Host: %s", cfg.CallbackHost))
	Info(fmt.Sprintf("   Rega Port: %d", cfg.RegaPort))
	if cfg.Debug {
		Info("   Debug Mode: ON")
	} else {
		Info("   Debug Mode: OFF")
	}
	if cfg.CCUUser != "" {
		Info("   Auth: enabled")
	}
}
