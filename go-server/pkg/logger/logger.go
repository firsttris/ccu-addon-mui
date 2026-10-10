package logger

import "log"

var debugMode bool

func SetDebugMode(enabled bool) {
	debugMode = enabled
}

func Info(args ...any) {
	log.Println(args...)
}

// Infof formats as fmt.Sprintf; the line is the same as Info's
func Infof(format string, args ...any) {
	log.Printf(format, args...)
}

func Error(args ...any) {
	log.Println(args...)
}

// Errorf formats as fmt.Sprintf; the line is the same as Error's
func Errorf(format string, args ...any) {
	log.Printf(format, args...)
}

// DebugEnabled lets callers skip building expensive debug output.
func DebugEnabled() bool {
	return debugMode
}

func Debug(args ...any) {
	if debugMode {
		log.Println(args...)
	}
}

// Debugf only formats when debug mode is on, so hot paths don't pay for
// messages that are thrown away.
func Debugf(format string, args ...any) {
	if debugMode {
		log.Printf(format, args...)
	}
}
