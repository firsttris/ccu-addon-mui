package rega

import (
	"ccu-addon-mui-server/pkg/home"
	"strconv"
	"strings"
)

// ReGa value types, see HM-Script documentation part 2.
const (
	valueTypeBool    = "2"
	valueTypeFloat   = "4"
	valueTypeInteger = "16"
)

type NamedObject = home.NamedObject

type Channel = home.Channel

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

// MaxChannelMode is the highest channel mode of an input channel.
const MaxChannelMode = 5

// parseChannels parses the output of get_channels.tcl.
func parseChannels(output string) []Channel {
	isRecord := func(line string) bool {
		return strings.HasPrefix(line, "C\t") || strings.HasPrefix(line, "A\t") || strings.HasPrefix(line, "S\t") || strings.HasPrefix(line, "D\t") || strings.HasPrefix(line, "M\t") || strings.HasPrefix(line, "F\t") || strings.HasPrefix(line, "O\t")
	}

	channels := []Channel{}
	// Battery and reachability by maintenance channel: written once per
	// device, they apply to all its channels
	status := map[string]map[string]bool{}
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
				Datapoints:    map[string]any{},
			})
		case "A":
			if len(fields) < 2 || len(channels) == 0 {
				continue
			}
			channels[len(channels)-1].StatusAddress = fields[1]
		case "S":
			if len(fields) < 4 || len(channels) == 0 {
				continue
			}
			channels[len(channels)-1].StatusAddress = fields[1]
			value, err := strconv.ParseBool(fields[3])
			if err != nil {
				// Never reported by the device
				continue
			}
			if status[fields[1]] == nil {
				status[fields[1]] = map[string]bool{}
			}
			status[fields[1]][normalizeStatusType(fields[2])] = value
		case "M":
			if len(fields) < 3 || len(channels) == 0 {
				continue
			}
			channel := &channels[len(channels)-1]
			channel.Rooms = parseIDs(fields[1])
			channel.Trades = parseIDs(fields[2])
		case "O":
			if len(fields) < 2 || len(channels) == 0 {
				continue
			}
			if mode, err := strconv.Atoi(strings.TrimSpace(fields[1])); err == nil && mode >= 0 && mode <= MaxChannelMode {
				channels[len(channels)-1].Mode = &mode
			}
		case "F":
			if len(fields) < 4 || len(channels) == 0 {
				continue
			}
			channel := &channels[len(channels)-1]
			channel.Hidden = fields[1] == "false"
			channel.ReadOnly = fields[2] == "false"
			channel.Logged = fields[3] == "true"
			channel.AES = len(fields) > 4 && fields[4] == "true"
		case "D":
			if len(fields) < 4 || len(channels) == 0 {
				continue
			}
			channel := &channels[len(channels)-1]
			channel.Datapoints[fields[1]] = parseValue(fields[2], rejoin(fields, 3))
		}
	}
	for i := range channels {
		channel := &channels[i]
		if channel.StatusAddress == "" {
			continue
		}
		reported := status[channel.StatusAddress]
		if len(reported) == 0 {
			// Neither battery nor reachability: no maintenance channel to watch
			channel.StatusAddress = ""
			continue
		}
		channel.Status = make(map[string]bool, len(reported))
		for statusType, value := range reported {
			channel.Status[statusType] = value
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

type DeviceProblem = home.DeviceProblem

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
func parseValue(valueType, value string) any {
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
