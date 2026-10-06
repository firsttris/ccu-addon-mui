package rega

import (
	"strconv"
	"strings"
)

// DeviceHealth is what a device's maintenance channel tells about it
// (get_device_health.tcl)
type DeviceHealth struct {
	Address   string `json:"address"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	Interface string `json:"interfaceName"`
	RoomID    int64  `json:"roomId,omitempty"`
	RoomName  string `json:"roomName,omitempty"`
	// The values by datapoint (LOW_BAT for LOWBAT too)
	Values map[string]HealthValue `json:"values"`
}

// HealthValue is a value with the time it was last set (Unix seconds, 0 if
// never)
type HealthValue struct {
	Value interface{} `json:"value"`
	Time  int64       `json:"time,omitempty"`
}

// GetDeviceHealth reads the maintenance values of all devices
func (c *Client) GetDeviceHealth() ([]DeviceHealth, error) {
	output, err := c.executeWithin(getDeviceHealthScript, longScriptTimeout)
	if err != nil {
		return nil, err
	}
	return parseDeviceHealth(output), nil
}

func parseDeviceHealth(output string) []DeviceHealth {
	isRecord := func(line string) bool { return strings.HasPrefix(line, "H\t") }
	devices := []DeviceHealth{}
	for _, fields := range splitRecords(output, isRecord) {
		if len(fields) < 8 || fields[0] != "H" {
			continue
		}
		roomID, _ := strconv.ParseInt(fields[4], 10, 64)
		device := DeviceHealth{
			Address: fields[1], Type: fields[2], Interface: fields[3],
			RoomID: roomID, RoomName: fields[5], Name: rejoin(fields, 7),
			Values: map[string]HealthValue{},
		}
		for _, entry := range strings.Split(fields[6], ";") {
			key, rest, ok := strings.Cut(entry, "=")
			if !ok || key == "" {
				continue
			}
			raw, timestamp, _ := strings.Cut(rest, "@")
			seconds, _ := strconv.ParseInt(timestamp, 10, 64)
			if seconds < 0 {
				seconds = 0
			}
			device.Values[normalizeStatusType(key)] = HealthValue{Value: healthValue(raw), Time: seconds}
		}
		devices = append(devices, device)
	}
	return devices
}

// healthValue: true/false, numbers, else the text; empty (never set) null
func healthValue(raw string) interface{} {
	switch raw {
	case "":
		return nil
	case "true":
		return true
	case "false":
		return false
	}
	if n, err := strconv.ParseFloat(raw, 64); err == nil {
		return n
	}
	return raw
}
