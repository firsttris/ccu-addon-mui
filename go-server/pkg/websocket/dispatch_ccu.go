//go:build !lite

package websocket

// dispatchPlatform handles what only a CCU has: its ReGa (programs, system
// variables, alarms, the system protocol, users) and the WebUI's system
// settings. openccu-lite's build leaves all of it out (dispatch_lite.go).
func (s *Server) dispatchPlatform(client *Client, msgType, requestID string, message []byte) bool {
	switch msgType {
	case "setChannelOption":
		s.handleSetChannelOption(client, message)
	case "getLogging", "setLogging", "downloadLogs":
		s.handleLogging(client, msgType, message)
	case "prepareRestore", "checkRestore", "restoreBackup", "prepareCcuFirmware", "prepareDeviceFirmwareUpload", "checkCcuFirmware", "downloadCcuFirmware", "installCcuFirmware", "cancelCcuFirmware", "prepareAddonUpload", "installAddon":
		s.handleRestore(client, msgType, message)
	case "getLanGateways", "setLanGateways", "changeLanGatewayKey", "setBidcosInterface":
		s.handleLanGateways(client, msgType, message)
	case "getCertificate", "uploadCertificate", "deleteCertificate":
		s.handleCertificate(client, msgType, message)
	case "getFirewall", "setFirewall":
		s.handleFirewall(client, msgType, message)
	case "getNetwork", "setNetwork":
		s.handleNetwork(client, msgType, message)
	case "getSecurity", "setSecurity", "changeSecurityKey", "setSessionTimeout", "factoryReset", "setSecurityLevel", "setSnmp":
		s.handleSecurity(client, msgType, message)
	case "runScript":
		s.handleRunScript(client, message)
	case "checkFirmwareUpdate":
		s.handleFirmwareUpdate(client, requestID)
	case "changePassword":
		s.handleChangePassword(client, message)
	case "getUsers", "saveUser", "deleteUser":
		s.handleUsers(client, msgType, message)
	case "getAddons", "addonAction", "checkAddonUpdate":
		s.handleAddons(client, msgType, message)
	case "checkSelfUpdate":
		s.handleCheckSelfUpdate(client, requestID)
	case "installSelfUpdate":
		// Download and install take a while: the client's other requests
		// go on meanwhile
		go s.handleInstallSelfUpdate(client.snapshot(), requestID)
	case "startComTest", "pollComTest":
		s.handleComTest(client, msgType, message)
	case "getDevicePrograms":
		s.handleDevicePrograms(client, message)
	case "getHistory", "clearHistory":
		s.handleHistory(client, msgType, message)
	case "getSystemSettings", "setLocation", "powerAction", "setTimeServers", "setTimeZone", "setClock", "setRegaVersion":
		s.handleSystemSettings(client, msgType, message)
	case "createBackup":
		// Packing /usr/local takes minutes: the client's other requests go
		// on meanwhile
		go s.handleCreateBackup(client.snapshot(), message)
	case "getSysvars", "setSysvar", "getPrograms", "runProgram", "setProgramActive", "setLogicOption":
		s.handleLogic(client, msgType, message)
	case "getProgram", "saveProgram", "deleteProgram":
		s.handleProgramEditor(client, msgType, message)
	case "getAlarmMessages", "acknowledgeAlarmMessage":
		s.handleServiceMessages(client, msgType, message)
	case "createSysvar", "renameSysvar", "deleteSysvar", "editSysvar":
		s.handleObjects(client, msgType, message)
	default:
		return false
	}
	return true
}
