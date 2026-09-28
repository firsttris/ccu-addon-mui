package logger

import (
	"fmt"
	"log"

	"ccu-addon-mui-server/pkg/config"
)

var debugMode bool

func SetDebugMode(enabled bool) {
	debugMode = enabled
}

func Info(args ...interface{}) {
	log.Println(args...)
}

func Error(args ...interface{}) {
	log.Println(args...)
}

// DebugEnabled lets callers skip building expensive debug output.
func DebugEnabled() bool {
	return debugMode
}

func Debug(args ...interface{}) {
	if debugMode {
		log.Println(args...)
	}
}

// Debugf only formats when debug mode is on, so hot paths don't pay for
// messages that are thrown away.
func Debugf(format string, args ...interface{}) {
	if debugMode {
		log.Printf(format, args...)
	}
}

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
