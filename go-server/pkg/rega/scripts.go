package rega

import (
	_ "embed"
)

//go:embed scripts/get_rooms.tcl
var getRoomsScript string

//go:embed scripts/get_trades.tcl
var getTradesScript string

//go:embed scripts/get_channels.tcl
var getChannelsScript string

//go:embed scripts/set_datapoint.tcl
var setDatapointScript string

//go:embed scripts/get_device_problems.tcl
var getDeviceProblemsScript string

//go:embed scripts/get_user_level.tcl
var getUserLevelScript string

//go:embed scripts/set_name.tcl
var setNameScript string

//go:embed scripts/set_group_member.tcl
var setGroupMemberScript string

//go:embed scripts/get_device_names.tcl
var getDeviceNamesScript string

// Scripts returns the script templates by name, for the fake CCU used in
// tests, which recognises scripts by their template.
func Scripts() map[string]string {
	return map[string]string{
		"get_rooms":           getRoomsScript,
		"get_trades":          getTradesScript,
		"get_channels":        getChannelsScript,
		"set_datapoint":       setDatapointScript,
		"get_device_problems": getDeviceProblemsScript,
		"get_user_level":      getUserLevelScript,
		"set_name":            setNameScript,
		"get_device_names":    getDeviceNamesScript,
		"set_group_member":    setGroupMemberScript,
	}
}
