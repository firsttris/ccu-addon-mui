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
		return strings.HasPrefix(line, "C\t") || strings.HasPrefix(line, "D\t")
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
