package websocket

import (
	"encoding/json"
	"fmt"
)

func (s *Server) handleMessage(client *Client, message []byte) {
	var baseMsg map[string]interface{}
	if err := json.Unmarshal(message, &baseMsg); err != nil {
		s.sendError(client, "invalid JSON: "+err.Error())
		return
	}

	// Every request may carry a requestId, which is echoed in its response
	// (or error) so the client can match them up.
	requestID, _ := baseMsg["requestId"].(string)

	msgType, ok := baseMsg["type"].(string)
	if !ok {
		s.sendRequestError(client, requestID, "missing or invalid 'type' field", "")
		return
	}

	switch msgType {
	case "auth":
		s.handleAuth(client, message)
		return
	case "login":
		s.handleLogin(client, message)
		return
	}

	if (s.auth != nil || s.gate != nil) && !client.authenticated {
		s.sendRequestError(client, requestID, "authentication required", "AUTH_REQUIRED")
		return
	}

	// (Clients built in tests without a reads channel stay sequential.)
	if parallelReads[msgType] && client.reads != nil {
		// Reading requests don't wait for each other: a slow history or
		// link list doesn't hold up switching a light. At most
		// maxParallelReads per connection; the read pump waits for a free
		// slot, so a flood of requests stays bounded.
		// Watches belong to the connection, not to the copy the request
		// runs with
		switch msgType {
		case "getAlarmMessages":
			client.watchMessages(true)
		case "getServiceMessages":
			client.watchMessages(false)
		}
		client.reads <- struct{}{}
		snap := client.snapshot()
		go func() {
			defer func() { <-client.reads }()
			recovered("handling a message", func() { s.dispatch(snap, msgType, requestID, message) })
		}()
		return
	}
	s.dispatch(client, msgType, requestID, message)
}

// parallelReads are the requests that only read: they neither change the
// CCU nor the connection's state (login, elevation, subscriptions, the
// sysvar watch of getSysvars), so they may run beside the others. Everything
// else is handled in order, as sent: the thermostat's "off" sends
// CONTROL_MODE before SET_POINT_TEMPERATURE.
var parallelReads = map[string]bool{
	"getRooms": true, "getTrades": true, "getChannels": true,
	"getDeviceProblems": true, "getDeviceHealth": true, "listDevices": true,
	"getParamsetDescription": true, "getParamset": true,
	"getSystemInfo": true, "getDiagramData": true, "getHeatingGroups": true,
	"getVirtualKeys": true, "getDevicePrograms": true, "getHistory": true,
	"getLinks": true, "getLinkParamsetDescription": true, "getLinkParamset": true, "getAllLinks": true,
	"getDeviceImages": true, "getPrograms": true, "getProgram": true,
	"getServiceMessages": true, "getAlarmMessages": true, "getFavorites": true,
}

const maxParallelReads = 4

func (s *Server) dispatch(client *Client, msgType, requestID string, message []byte) {
	switch msgType {
	case "subscribe":
		s.handleSubscribe(client, message)
	case "getRooms":
		s.handleGetRooms(client, message)
	case "getTrades":
		s.handleGetTrades(client, message)
	case "getChannels":
		s.handleGetChannels(client, message)
	case "setDatapoint":
		s.handleSetDatapoint(client, message)
	case "getDeviceProblems":
		s.handleGetDeviceProblems(client, requestID)
	case "getDeviceHealth":
		s.handleDeviceHealth(client, requestID)
	case "getParamsetDescription", "getParamset":
		s.handleParamsetRequest(client, msgType, message)
	case "putParamset":
		s.handlePutParamset(client, message)
	case "listDevices":
		s.handleListDevices(client, requestID)
	case "elevate":
		s.handleElevate(client, message)
	case "endElevation":
		s.handleEndElevation(client, message)
	case "rename":
		s.handleRename(client, message)
	case "setChannelTile":
		s.handleSetChannelTile(client, message)
	case "getSystemInfo":
		s.handleSystemInfo(client, requestID)
	case "getGeneralSettings", "setGeneralSettings":
		s.handleGeneralSettings(client, msgType, message)
	case "getDiagrams", "getDiagramData", "saveDiagram", "deleteDiagram":
		s.handleDiagrams(client, msgType, message)
	case "getHeatingGroupMembers", "saveHeatingGroup", "deleteHeatingGroup":
		s.handleHeatingGroupChange(client, msgType, message)
	case "getHeatingGroups":
		s.handleHeatingGroups(client, requestID)
	case "getUserLanguage", "setUserLanguage":
		s.handleUserLanguage(client, msgType, message)
	case "listSessions", "revokeSession", "logout":
		s.handleSessions(client, msgType, message)
	case "getLinks", "addLink", "removeLink", "getLinkParamsetDescription", "getLinkParamset", "putLinkParamset":
		s.handleLinks(client, msgType, message)
	case "getAllLinks":
		s.handleAllLinks(client, requestID)
	case "getLayout", "setLayout":
		s.handleLayout(client, msgType, message)
	case "getPush", "subscribePush", "unsubscribePush", "testPush":
		s.handlePush(client, msgType, message)
	case "getVirtualKeys":
		s.handleVirtualKeys(client, requestID)
	case "getDeviceImages":
		s.handleDeviceImages(client, requestID)
	case "getRules", "saveRule", "deleteRule":
		s.handleRules(client, msgType, message)
	case "setGroupMember":
		s.handleSetGroupMember(client, message)
	case "setInstallMode", "getInstallMode", "getInbox", "acceptDevice", "deleteDevice", "listReplaceableDevices", "replaceDevice", "addDeviceBySerial", "setTempKey", "searchWiredDevices", "getInterfaces":
		s.handlePairing(client, msgType, message)
	case "installFirmware":
		s.handleInstallFirmware(client, message)
	case "checkDeviceFirmware", "downloadDeviceFirmware", "addDeviceFirmware":
		// eQ-3 and the HMServer may take minutes: the client's other
		// requests go on meanwhile
		go s.handleDeviceFirmware(client.snapshot(), msgType, message)
	case "getDeviceFirmware", "getDeviceFirmwareChangelog", "deleteDeviceFirmware":
		s.handleDeviceFirmware(client, msgType, message)
	case "getServiceMessages", "acknowledgeServiceMessage":
		s.handleServiceMessages(client, msgType, message)
	case "createGroup", "renameGroup", "deleteGroup":
		s.handleObjects(client, msgType, message)
	case "getFavorites", "createFavorite", "renameFavorite", "deleteFavorite", "addFavoriteItem", "removeFavoriteItem":
		s.handleFavorites(client, msgType, message)
	default:
		if s.dispatchPlatform(client, msgType, requestID, message) {
			return
		}
		s.sendRequestError(client, requestID, fmt.Sprintf("unknown message type: %s", msgType), "")
	}
}
