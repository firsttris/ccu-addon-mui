package rega

import (
	"strconv"
	"strings"
)

// ReGa value types, see HM-Script documentation part 2.
const (
	valueTypeBool    = "2"
	valueTypeFloat   = "4"
	valueTypeInteger = "16"
)

// NamedObject is a room or a trade.
type NamedObject struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type Channel struct {
	ID            int64                  `json:"id"`
	Address       string                 `json:"address"`
	Name          string                 `json:"name"`
	Type          string                 `json:"type"`
	InterfaceName string                 `json:"interfaceName"`
	Datapoints    map[string]interface{} `json:"datapoints"`

	// StatusAddress is the device's maintenance channel (":0"), which
	// reports Status (LOW_BAT, UNREACH) and sends the events for it.
	StatusAddress string          `json:"statusAddress,omitempty"`
	Status        map[string]bool `json:"status,omitempty"`

	// Rooms and Trades are the ids of the rooms and trades the channel
	// belongs to.
	Rooms  []int64 `json:"rooms,omitempty"`
	Trades []int64 `json:"trades,omitempty"`

	// Tile is the tile chosen for the channel in the add-on ("light" or
	// "switch"), stored as ReGa metadata; empty lets the app decide.
	Tile string `json:"tile,omitempty"`

	// The WebUI's channel options: Hidden (not visible), ReadOnly (not
	// usable by non-administrators), Logged (in the system protocol)
	Hidden   bool `json:"hidden,omitempty"`
	ReadOnly bool `json:"readOnly,omitempty"`
	Logged   bool `json:"logged,omitempty"`
}

// parseIDs parses a comma separated list of ids.
func parseIDs(s string) []int64 {
	var ids []int64
	for _, field := range strings.Split(s, ",") {
		if id, err := strconv.ParseInt(strings.TrimSpace(field), 10, 64); err == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

// splitRecords splits the script output into lines of tab separated fields.
// A name or value may itself contain a line break; a line that doesn't start
// a new record (per isRecord) continues the last field of the previous one.
func splitRecords(output string, isRecord func(line string) bool) [][]string {
	var records [][]string
	for _, line := range strings.Split(strings.ReplaceAll(output, "\r\n", "\n"), "\n") {
		if isRecord(line) || len(records) == 0 {
			if line != "" {
				records = append(records, strings.Split(line, "\t"))
			}
			continue
		}
		last := records[len(records)-1]
		last[len(last)-1] += "\n" + line
	}
	// Drop the line break WriteLine appends after the last record.
	if n := len(records); n > 0 {
		last := records[n-1]
		last[len(last)-1] = strings.TrimSuffix(last[len(last)-1], "\n")
	}
	return records
}

// rejoin returns fields[i:] joined, for a trailing field that may contain tabs.
func rejoin(fields []string, i int) string {
	if i >= len(fields) {
		return ""
	}
	return strings.Join(fields[i:], "\t")
}

// parseNamedObjects parses the output of get_rooms.tcl and get_trades.tcl:
// one "<id>\t<name>" line per entry.
func parseNamedObjects(output string) []NamedObject {
	isRecord := func(line string) bool {
		id, _, ok := strings.Cut(line, "\t")
		_, err := strconv.ParseInt(id, 10, 64)
		return ok && err == nil
	}

	objects := []NamedObject{}
	for _, fields := range splitRecords(output, isRecord) {
		id, err := strconv.ParseInt(fields[0], 10, 64)
		if err != nil {
			continue
		}
		objects = append(objects, NamedObject{ID: id, Name: rejoin(fields, 1)})
	}
	return objects
}

// parseChannels parses the output of get_channels.tcl.
func parseChannels(output string) []Channel {
	isRecord := func(line string) bool {
		return strings.HasPrefix(line, "C\t") || strings.HasPrefix(line, "S\t") || strings.HasPrefix(line, "D\t") || strings.HasPrefix(line, "M\t") || strings.HasPrefix(line, "T\t") || strings.HasPrefix(line, "F\t")
	}

	channels := []Channel{}
	for _, fields := range splitRecords(output, isRecord) {
		switch fields[0] {
		case "C":
			if len(fields) < 6 {
				continue
			}
			id, err := strconv.ParseInt(fields[1], 10, 64)
			if err != nil {
				continue
			}
			channels = append(channels, Channel{
				ID:            id,
				Address:       fields[2],
				Type:          fields[3],
				InterfaceName: fields[4],
				Name:          rejoin(fields, 5),
				Datapoints:    map[string]interface{}{},
			})
		case "S":
			if len(fields) < 4 || len(channels) == 0 {
				continue
			}
			value, err := strconv.ParseBool(fields[3])
			if err != nil {
				// Never reported by the device
				continue
			}
			channel := &channels[len(channels)-1]
			if channel.Status == nil {
				channel.Status = map[string]bool{}
			}
			channel.StatusAddress = fields[1]
			channel.Status[normalizeStatusType(fields[2])] = value
		case "M":
			if len(fields) < 3 || len(channels) == 0 {
				continue
			}
			channel := &channels[len(channels)-1]
			channel.Rooms = parseIDs(fields[1])
			channel.Trades = parseIDs(fields[2])
		case "T":
			if len(fields) < 2 || len(channels) == 0 {
				continue
			}
			if fields[1] == TileLight || fields[1] == TileSwitch {
				channels[len(channels)-1].Tile = fields[1]
			}
		case "F":
			if len(fields) < 4 || len(channels) == 0 {
				continue
			}
			channel := &channels[len(channels)-1]
			channel.Hidden = fields[1] == "false"
			channel.ReadOnly = fields[2] == "false"
			channel.Logged = fields[3] == "true"
		case "D":
			if len(fields) < 4 || len(channels) == 0 {
				continue
			}
			channel := &channels[len(channels)-1]
			channel.Datapoints[fields[1]] = parseValue(fields[2], rejoin(fields, 3))
		}
	}
	return channels
}

// normalizeStatusType maps the BidCos name LOWBAT to the HmIP name LOW_BAT.
func normalizeStatusType(statusType string) string {
	if statusType == "LOWBAT" {
		return "LOW_BAT"
	}
	return statusType
}

type DeviceProblem struct {
	Address  string `json:"address"`
	Name     string `json:"name"`
	RoomID   int64  `json:"roomId,omitempty"`
	RoomName string `json:"roomName,omitempty"`
	LowBat   bool   `json:"lowBat"`
	Unreach  bool   `json:"unreach"`
}

// parseDeviceProblems parses the output of get_device_problems.tcl.
func parseDeviceProblems(output string) []DeviceProblem {
	isRecord := func(line string) bool { return strings.HasPrefix(line, "P\t") }

	problems := []DeviceProblem{}
	for _, fields := range splitRecords(output, isRecord) {
		if len(fields) < 7 || fields[0] != "P" {
			continue
		}
		roomID, _ := strconv.ParseInt(fields[4], 10, 64)
		problems = append(problems, DeviceProblem{
			Address:  fields[1],
			LowBat:   fields[2] == "true",
			Unreach:  fields[3] == "true",
			RoomID:   roomID,
			RoomName: fields[5],
			Name:     rejoin(fields, 6),
		})
	}
	return problems
}

// parseValue converts a datapoint value as written by ReGa into its JSON
// type. An empty value (datapoint never set) becomes null.
func parseValue(valueType, value string) interface{} {
	if value == "" {
		return nil
	}
	switch valueType {
	case valueTypeBool:
		if b, err := strconv.ParseBool(value); err == nil {
			return b
		}
	case valueTypeFloat, valueTypeInteger:
		if f, err := strconv.ParseFloat(value, 64); err == nil {
			return f
		}
	}
	return value
}
