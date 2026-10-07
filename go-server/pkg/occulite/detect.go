// Package occulite talks to occulited, the system service of openccu-lite
// (https://github.com/hobbyquaker/occulited): its metadata API for names,
// rooms and functions, its auth API for the logged-in user, and its system
// API for service messages, heating groups and device firmware.
package occulite

import (
	"os"
	"strings"
)

// The files the detection reads; variables for tests
var (
	VersionFile  = "/VERSION"
	OcculitedBin = "/usr/bin/occulited"
)

// Detect tells openccu-lite from a CCU: /VERSION has a LITE= line, or
// occulited is installed. Not VARIANT=lite (ccu-addon-howto
// docs/11-openccu-lite.md, "Detection: one rule").
func Detect() bool {
	if data, err := os.ReadFile(VersionFile); err == nil {
		for _, line := range strings.Split(string(data), "\n") {
			if strings.HasPrefix(line, "LITE=") {
				return true
			}
		}
	}
	info, err := os.Stat(OcculitedBin)
	return err == nil && info.Mode().IsRegular() && info.Mode().Perm()&0o111 != 0
}

// Version is the LITE= line of /VERSION, "" when there is none
func Version() string {
	data, err := os.ReadFile(VersionFile)
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(data), "\n") {
		if value, ok := strings.CutPrefix(line, "LITE="); ok {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
