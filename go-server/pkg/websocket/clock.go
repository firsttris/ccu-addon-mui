package websocket

import (
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"sort"
	"strings"
	"time"

	"ccu-addon-mui-server/pkg/logger"
)

// The files cp_time.cgi keeps the time server and the time zone in
var (
	ntpClientFile = "/etc/config/ntpclient"
	tzFile        = "/etc/config/TZ"
	zoneTabFile   = "/usr/share/zoneinfo/zone.tab"
)

// SetClockFiles sets where time.conf, ntpclient and TZ are (for tests)
func SetClockFiles(timeConf, ntpClient, tz string) {
	if timeConf != "" {
		timeConfFile = timeConf
	}
	if ntpClient != "" {
		ntpClientFile = ntpClient
	}
	if tz != "" {
		tzFile = tz
	}
}

// The WebUI's time zones (cp_time.cgi TIMEZONES) with what it writes to TZ;
// the zones of zone.tab come on top and are written by name
var timeZones = map[string]string{
	"ACST":       "ACST-9:30",
	"ACST/ACDT":  "ACST-9:30ACDT-10:30,M10.5.0/02:00:00,M3.5.0/03:00:00",
	"AEST":       "AEST-10",
	"AEST/AEDT":  "AEST-10AEDT-11,M10.1.0/02:00:00,M3.5.0/03:00:00",
	"AKST/AKDT":  "AKST+9AKDT+8,M3.2.0,M11.1.0",
	"AST/ADT":    "AST+4ADT+3,M4.1.0/00:01:00,M10.5.0/00:01:00",
	"AWST/AWDT":  "AWST-8AWDT-9,M12.1.0,M3.5.0/03:00:00",
	"BRST/BRDT":  "BRST+3BRDT+2,M10.3.0,M2.3.0",
	"CET/CEST":   "CET-1CEST-2,M3.5.0/02:00:00,M10.5.0/03:00:00",
	"CST":        "CST+6",
	"CST/CDT":    "CST+6CDT+5,M3.2.0,M11.1.0",
	"EET/EEST":   "EET-2EEST-3,M3.5.0/03:00:00,M10.5.0/04:00:00",
	"EST/EDT":    "EST+5EDT+4,M3.2.0,M11.1.0",
	"GMT/BST":    "GMT+0BST-1,M3.5.0/01:00:00,M10.5.0/02:00:00",
	"GMT/IST":    "GMT+0IST-1,M3.5.0/01:00:00,M10.5.0/02:00:00",
	"HAW":        "HAW+10",
	"HKT":        "HKT-8",
	"MSK/MSD":    "MSK-3MSD-4,M3.5.0/2,M10.5.0/3",
	"RMST/RMDT":  "RMST-3RMDT-4,M3.5.0/2,M10.5.0/3",
	"MST":        "MST+7",
	"MST/MDT":    "MST+7MDT+6,M3.2.0,M11.1.0",
	"NST/NDT":    "NST+3:30NDT+2:30,M3.2.0/00:01:00,M11.1.0/00:01:00",
	"NZST/NZDT":  "NZST-12NZDT-13,M10.1.0/02:00:00,M3.3.0/03:00:00",
	"PST/PDT":    "PST+8PDT+7,M3.2.0,M11.1.0",
	"SGT":        "SGT-8",
	"ULAT/ULAST": "ULAT-8ULAST-9,M3.5.0/2,M9.5.0/2",
	"WET/WEST":   "WET-0WEST-1,M3.5.0/01:00:00,M10.5.0/02:00:00",
	"WIB":        "WIB-7",
}

var zoneTabLine = regexp.MustCompile(`(?m)^[^#]\S+\t\S+\t(\S+)`)

// timeZoneList: the WebUI's zones and zone.tab's, sorted
func timeZoneList() []string {
	seen := map[string]bool{}
	for zone := range timeZones {
		seen[zone] = true
	}
	if data, err := os.ReadFile(zoneTabFile); err == nil {
		for _, m := range zoneTabLine.FindAllStringSubmatch(string(data), -1) {
			seen[m[1]] = true
		}
	}
	list := make([]string, 0, len(seen))
	for zone := range seen {
		list = append(list, zone)
	}
	sort.Strings(list)
	return list
}

// tzValue is what set_location_config writes to TZ for a zone; "" if unknown
func tzValue(zone string) string {
	if value, ok := timeZones[zone]; ok {
		return value
	}
	for _, known := range timeZoneList() {
		if known == zone {
			return zone
		}
	}
	return ""
}

var ntpLine = regexp.MustCompile(`(?m)^\s*NTPSERVERS\s*=\s*'?([^'\n]*)'?\s*$`)

// readTimeServers reads ntpclient as get_timeservers does; ok false without it
func readTimeServers() (string, bool) {
	data, err := os.ReadFile(ntpClientFile)
	if err != nil {
		return "", false
	}
	if m := ntpLine.FindStringSubmatch(string(data)); m != nil {
		return m[1], true
	}
	return "", true
}

// Host names and addresses, separated by blanks
var timeServersRegex = regexp.MustCompile(`^[A-Za-z0-9.:\-\[\] ]{0,255}$`)

func writeTimeServers(servers string) error {
	servers = strings.Join(strings.Fields(servers), " ")
	if !timeServersRegex.MatchString(servers) {
		return fmt.Errorf("invalid time servers")
	}
	return os.WriteFile(ntpClientFile, []byte("NTPSERVERS='"+servers+"'\n"), 0o644)
}

// writeTimeZone writes time.conf's TIMEZONE and TZ, as set_location_config
func writeTimeZone(zone string) error {
	value := tzValue(zone)
	if value == "" {
		return fmt.Errorf("invalid time zone")
	}
	values := readTimeConf()
	if values == nil {
		return fmt.Errorf("time.conf is missing")
	}
	values["TIMEZONE"] = zone
	var b strings.Builder
	for _, key := range []string{"COUNTRY", "CITY", "LATITUDE", "LONGITUDE", "TIMEZONE"} {
		b.WriteString(key + "=" + values[key] + "\n")
	}
	if err := os.WriteFile(timeConfFile, []byte(b.String()), 0o644); err != nil {
		return err
	}
	return os.WriteFile(tzFile, []byte(value+"\n"), 0o644)
}

// clockAvailable: the add-on runs on the CCU itself, where date, hwclock and
// SetInterfaceClock may be run
var clockAvailable = func() bool {
	if firmwareVersion() == "" {
		return false
	}
	_, err := os.Stat("/sbin/hwclock")
	return err == nil
}

var rfdPortLine = regexp.MustCompile(`EQ3_SERVICE_RFD_PORT\s+(\d+)`)

// rfdAddress: where SetInterfaceClock reaches rfd (/etc/eq3services.ports.tcl)
func rfdAddress() string {
	port := "2001"
	if data, err := os.ReadFile("/etc/eq3services.ports.tcl"); err == nil {
		if m := rfdPortLine.FindStringSubmatch(string(data)); m != nil {
			port = m[1]
		}
	}
	return "127.0.0.1:" + port
}

// runClock runs a command of cp_time.cgi; only on the CCU
var runClock = func(name string, args ...string) error {
	if !clockAvailable() {
		return nil
	}
	output, err := exec.Command(name, args...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %v %s", name, err, strings.TrimSpace(string(output)))
	}
	return nil
}

// afterClockChange: what cp_time.cgi runs once the clock or zone changed
func afterClockChange(commands ...[]string) {
	for _, command := range commands {
		if err := runClock(command[0], command[1:]...); err != nil {
			logger.Error("Failed to run", err)
		}
	}
}

// parseClock reads "2026-10-04 12:30:00"
func parseClock(text string) (time.Time, error) {
	t, err := time.Parse("2006-01-02 15:04:05", text)
	if err != nil || t.Year() < 2000 || t.Year() > 2099 {
		return time.Time{}, fmt.Errorf("invalid time")
	}
	return t, nil
}
