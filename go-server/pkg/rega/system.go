package rega

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// SystemSettings is the location and clock of the CCU.
type SystemSettings struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	// Minutes east of UTC, as system.TimeZoneOffset() reads it
	TimeZoneOffset int `json:"timeZoneOffset"`
	// The CCU's local time, YYYY-MM-DD HH:MM:SS
	Time string `json:"time"`
}

// GetSystemSettings reads the location and clock (get_system_settings.tcl).
func (c *Client) GetSystemSettings() (SystemSettings, error) {
	output, err := c.Execute(getSystemSettingsScript)
	if err != nil {
		return SystemSettings{}, err
	}
	return parseSystemSettings(output)
}

func parseSystemSettings(output string) (SystemSettings, error) {
	fields := strings.Split(strings.TrimRight(output, "\r\n"), "\t")
	if len(fields) < 5 || fields[0] != SetOK {
		return SystemSettings{}, fmt.Errorf("unexpected response from ReGa: %q", output)
	}
	var settings SystemSettings
	settings.Latitude, _ = strconv.ParseFloat(strings.TrimSpace(fields[1]), 64)
	settings.Longitude, _ = strconv.ParseFloat(strings.TrimSpace(fields[2]), 64)
	if offset, err := strconv.ParseFloat(strings.TrimSpace(fields[3]), 64); err == nil {
		settings.TimeZoneOffset = int(offset)
	}
	settings.Time = strings.TrimSpace(fields[4])
	return settings, nil
}

// SetLocation sets latitude and longitude for sunrise and sunset
// (set_location.tcl).
func (c *Client) SetLocation(latitude, longitude float64) (string, error) {
	if math.IsNaN(latitude) || math.IsNaN(longitude) || math.Abs(latitude) > 90 || math.Abs(longitude) > 180 {
		return "", fmt.Errorf("invalid location")
	}
	script := strings.NewReplacer(
		"{{LATITUDE}}", FormatCoordinate(latitude),
		"{{LONGITUDE}}", FormatCoordinate(longitude),
	).Replace(setLocationScript)
	output, err := c.Execute(script)
	if err != nil {
		return "", err
	}
	result, _, err := resultWithValue(output)
	return result, err
}

// FormatCoordinate writes a coordinate as plain decimal (no exponent),
// rounded to six places (about 0.1 m).
func FormatCoordinate(value float64) string {
	rounded := math.Round(value*1e6) / 1e6
	if rounded == 0 {
		rounded = 0 // no "-0"
	}
	return strconv.FormatFloat(rounded, 'f', -1, 64)
}

// SaveSystem saves the ReGa object model (save_system.tcl).
func (c *Client) SaveSystem() (string, error) {
	output, err := c.Execute(saveSystemScript)
	if err != nil {
		return "", err
	}
	result, _, err := resultWithValue(output)
	return result, err
}
