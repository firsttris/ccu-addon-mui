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

//go:embed scripts/get_inbox.tcl
var getInboxScript string

//go:embed scripts/accept_device.tcl
var acceptDeviceScript string

//go:embed scripts/get_sysvars.tcl
var getSysvarsScript string

//go:embed scripts/set_sysvar.tcl
var setSysvarScript string

//go:embed scripts/get_programs.tcl
var getProgramsScript string

//go:embed scripts/program_action.tcl
var programActionScript string

//go:embed scripts/create_group.tcl
var createGroupScript string

//go:embed scripts/rename_group.tcl
var renameGroupScript string

//go:embed scripts/delete_group.tcl
var deleteGroupScript string

//go:embed scripts/create_sysvar.tcl
var createSysvarScript string

//go:embed scripts/rename_sysvar.tcl
var renameSysvarScript string

//go:embed scripts/delete_sysvar.tcl
var deleteSysvarScript string

//go:embed scripts/get_service_messages.tcl
var getServiceMessagesScript string

//go:embed scripts/acknowledge_service_message.tcl
var acknowledgeServiceMessageScript string

//go:embed scripts/get_alarm_messages.tcl
var getAlarmMessagesScript string

//go:embed scripts/acknowledge_alarm_message.tcl
var acknowledgeAlarmMessageScript string

// Scripts returns the script templates by name, for the fake CCU used in
// tests, which recognises scripts by their template.
func Scripts() map[string]string {
	return map[string]string{
		"get_rooms":                   getRoomsScript,
		"get_trades":                  getTradesScript,
		"get_channels":                getChannelsScript,
		"set_datapoint":               setDatapointScript,
		"get_device_problems":         getDeviceProblemsScript,
		"get_user_level":              getUserLevelScript,
		"set_name":                    setNameScript,
		"get_device_names":            getDeviceNamesScript,
		"get_inbox":                   getInboxScript,
		"accept_device":               acceptDeviceScript,
		"get_sysvars":                 getSysvarsScript,
		"set_sysvar":                  setSysvarScript,
		"get_programs":                getProgramsScript,
		"program_action":              programActionScript,
		"set_group_member":            setGroupMemberScript,
		"create_group":                createGroupScript,
		"rename_group":                renameGroupScript,
		"delete_group":                deleteGroupScript,
		"create_sysvar":               createSysvarScript,
		"rename_sysvar":               renameSysvarScript,
		"delete_sysvar":               deleteSysvarScript,
		"get_service_messages":        getServiceMessagesScript,
		"acknowledge_service_message": acknowledgeServiceMessageScript,
		"get_alarm_messages":          getAlarmMessagesScript,
		"acknowledge_alarm_message":   acknowledgeAlarmMessageScript,
		"get_favorites":               getFavoritesScript,
		"favorite_change":             favoriteChangeScript,
		"set_channel_tile":            setChannelTileScript,
		"get_program":                 getProgramScript,
		"save_program":                saveProgramScript,
		"delete_program":              deleteProgramScript,
		"get_layout":                  getLayoutScript,
		"set_layout":                  setLayoutScript,
		"get_system_settings":         getSystemSettingsScript,
		"set_location":                setLocationScript,
		"save_system":                 saveSystemScript,
		"get_users":                   getUsersScript,
		"save_user":                   saveUserScript,
		"delete_user":                 deleteUserScript,
		"set_channel_option":          setChannelOptionScript,
		"get_read_only_channels":      getReadOnlyChannelsScript,
		"get_history":                 getHistoryScript,
		"clear_history":               clearHistoryScript,
		"set_user_password":           setUserPasswordScript,
	}
}

//go:embed scripts/get_favorites.tcl
var getFavoritesScript string

//go:embed scripts/favorite_change.tcl
var favoriteChangeScript string

//go:embed scripts/set_channel_tile.tcl
var setChannelTileScript string

//go:embed scripts/get_program.tcl
var getProgramScript string

//go:embed scripts/save_program.tcl
var saveProgramScript string

//go:embed scripts/delete_program.tcl
var deleteProgramScript string

//go:embed scripts/get_layout.tcl
var getLayoutScript string

//go:embed scripts/set_layout.tcl
var setLayoutScript string

//go:embed scripts/get_system_settings.tcl
var getSystemSettingsScript string

//go:embed scripts/set_location.tcl
var setLocationScript string

//go:embed scripts/save_system.tcl
var saveSystemScript string

//go:embed scripts/get_users.tcl
var getUsersScript string

//go:embed scripts/save_user.tcl
var saveUserScript string

//go:embed scripts/delete_user.tcl
var deleteUserScript string

//go:embed scripts/set_channel_option.tcl
var setChannelOptionScript string

//go:embed scripts/get_read_only_channels.tcl
var getReadOnlyChannelsScript string

//go:embed scripts/get_history.tcl
var getHistoryScript string

//go:embed scripts/clear_history.tcl
var clearHistoryScript string

//go:embed scripts/set_user_password.tcl
var setUserPasswordScript string
