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

func Debug(args ...interface{}) {
	if debugMode {
		log.Println(args...)
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
