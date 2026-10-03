package rega

import (
	"fmt"
	"strconv"
	"strings"
)

// HistoryEntry is one entry of the system protocol (logged datapoints).
type HistoryEntry struct {
	// Entries written together (one event) share a group
	Group int    `json:"group"`
	Time  string `json:"time"`
	// "channel" or "sysvar"
	Kind string `json:"kind"`
	Name string `json:"name"`
	// The datapoint of a channel (STATE, LEVEL, ...)
	Datapoint string `json:"datapoint,omitempty"`
	Value     string `json:"value"`
	// The value as the WebUI writes it, for system variables
	Text string `json:"text,omitempty"`
}

// The most entries read at once
const maxHistoryCount = 500

// GetHistory reads count entries of the system protocol from start (0 is
// the newest), with the total number of entries (get_history.tcl).
func (c *Client) GetHistory(start, count int) (entries []HistoryEntry, total int, err error) {
	if start < 0 || count < 1 || count > maxHistoryCount {
		return nil, 0, fmt.Errorf("invalid range")
	}
	script := strings.NewReplacer("{{START}}", strconv.Itoa(start), "{{COUNT}}", strconv.Itoa(count)).Replace(getHistoryScript)
	output, err := c.Execute(script)
	if err != nil {
		return nil, 0, err
	}
	entries, total = parseHistory(output)
	return entries, total, nil
}

func parseHistory(output string) ([]HistoryEntry, int) {
	entries := []HistoryEntry{}
	total := 0
	for _, line := range strings.Split(output, "\n") {
		fields := strings.Split(strings.TrimRight(line, "\r"), "\t")
		switch {
		case fields[0] == "N" && len(fields) >= 2:
			total, _ = strconv.Atoi(strings.TrimSpace(fields[1]))
		case fields[0] == "H" && len(fields) >= 8:
			group, _ := strconv.Atoi(fields[1])
			entries = append(entries, HistoryEntry{
				Group: group, Time: fields[2], Kind: fields[3], Name: fields[4],
				Datapoint: fields[5], Value: fields[6], Text: strings.TrimSpace(fields[7]),
			})
		}
	}
	return entries, total
}

// ClearHistory clears the system protocol (clear_history.tcl).
func (c *Client) ClearHistory() (string, error) {
	output, err := c.Execute(clearHistoryScript)
	if err != nil {
		return "", err
	}
	result, _, err := resultWithValue(output)
	return result, err
}
