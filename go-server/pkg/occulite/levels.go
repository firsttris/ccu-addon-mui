package occulite

import "ccu-addon-mui-server/pkg/auth"

// AddonLevel maps openccu-lite's levels to this add-on's: configure and
// administer may change devices (meta:write, rpc:configure come with
// configure, docs/system-api.md "Scopes"), operate switches, read watches
func AddonLevel(level string) string {
	switch level {
	case LevelConfigure, LevelAdminister:
		return auth.LevelAdmin
	case LevelOperate:
		return auth.LevelUser
	default:
		return auth.LevelGuest
	}
}
