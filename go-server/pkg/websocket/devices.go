package websocket

import (
	"sync"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
)

type deviceProblemsResponse struct {
	Type      string               `json:"type"`
	Devices   []rega.DeviceProblem `json:"devices"`
	RequestID string               `json:"requestId,omitempty"`
}

func (s *Server) handleGetDeviceProblems(client *Client, requestID string) {
	devices, err := s.home.GetDeviceProblems()
	if err != nil {
		s.sendRequestError(client, requestID, "getDeviceProblems failed: "+err.Error(), "")
		return
	}
	s.sendJSON(client, deviceProblemsResponse{Type: "deviceProblems", Devices: devices, RequestID: requestID})
}

type paramsetRequest struct {
	RequestID     string `json:"requestId"`
	InterfaceName string `json:"interfaceName"`
	Address       string `json:"address"`
	ParamsetKey   string `json:"paramsetKey"`
}

type paramsetDescriptionResponse struct {
	Type        string                     `json:"type"`
	RequestID   string                     `json:"requestId,omitempty"`
	Address     string                     `json:"address"`
	ParamsetKey string                     `json:"paramsetKey"`
	Description ccurpc.ParamsetDescription `json:"description"`
}

type paramsetResponse struct {
	Type        string         `json:"type"`
	RequestID   string         `json:"requestId,omitempty"`
	Address     string         `json:"address"`
	ParamsetKey string         `json:"paramsetKey"`
	Values      map[string]any `json:"values"`
}

// handleParamsetRequest answers getParamsetDescription and getParamset.
// Both only read; addresses and keys are validated by ccurpc.
func (s *Server) handleParamsetRequest(client *Client, msgType string, message []byte) {
	rpc := s.rpcFor(client)
	var msg paramsetRequest
	if !s.decode(client, message, &msg) {
		return
	}
	if s.rpc == nil {
		s.sendRequestError(client, msg.RequestID, msgType+" is not available", "NOT_AVAILABLE")
		return
	}
	// Values and settings only: with a partner address as key the CCU would
	// hand out the parameters of a direct link, which only administrators
	// may read (getLinkParamset)
	if msg.ParamsetKey != "VALUES" && msg.ParamsetKey != "MASTER" {
		s.sendRequestError(client, msg.RequestID, "paramsetKey must be VALUES or MASTER", "INVALID_REQUEST")
		return
	}

	if msgType == "getParamsetDescription" {
		description, err := rpc.GetParamsetDescription(msg.InterfaceName, msg.Address, msg.ParamsetKey)
		if err != nil {
			s.sendRequestError(client, msg.RequestID, msgType+" failed: "+err.Error(), "")
			return
		}
		s.sendJSON(client, paramsetDescriptionResponse{
			Type: "paramsetDescription", RequestID: msg.RequestID,
			Address: msg.Address, ParamsetKey: msg.ParamsetKey, Description: description,
		})
		return
	}

	values, err := rpc.GetParamset(msg.InterfaceName, msg.Address, msg.ParamsetKey)
	if err != nil {
		s.sendRequestError(client, msg.RequestID, msgType+" failed: "+err.Error(), "")
		return
	}
	s.sendJSON(client, paramsetResponse{
		Type: "paramset", RequestID: msg.RequestID,
		Address: msg.Address, ParamsetKey: msg.ParamsetKey, Values: values,
	})
}

// Device is a device (not a channel) as listed for the setup area.
type Device struct {
	InterfaceName string `json:"interfaceName"`
	// Name from ReGa
	Name string `json:"name,omitempty"`
	ccurpc.DeviceDescription
	// Channels with their link roles, for choosing link partners
	Channels []ccurpc.DeviceDescription `json:"channels,omitempty"`
}

type listDevicesResponse struct {
	Type      string   `json:"type"`
	RequestID string   `json:"requestId,omitempty"`
	Devices   []Device `json:"devices"`
}

// handleListDevices lists the devices of all interfaces. An interface that
// doesn't answer (e.g. no VirtualDevices) is left out.
func (s *Server) handleListDevices(client *Client, requestID string) {
	rpc := s.rpcFor(client)
	if s.rpc == nil {
		s.sendRequestError(client, requestID, "listDevices is not available", "NOT_AVAILABLE")
		return
	}
	// The interfaces and ReGa (names) are asked at the same time: each
	// listDevices takes a while on a CCU with many devices
	interfaces := s.rpc.InterfaceNames()
	lists := make([][]ccurpc.DeviceDescription, len(interfaces))
	var names map[string]string
	var wg sync.WaitGroup
	if s.home != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			var err error
			// Without the names the list still works
			if names, err = s.home.GetDeviceNames(); err != nil {
				logger.Debugf("getDeviceNames: %v", err)
			}
		}()
	}
	for i, iface := range interfaces {
		wg.Add(1)
		go func(i int, iface string) {
			defer wg.Done()
			list, err := rpc.ListDevices(iface)
			if err != nil {
				logger.Debugf("listDevices %s: %v", iface, err)
				return
			}
			lists[i] = list
		}(i, iface)
	}
	wg.Wait()

	devices := []Device{}
	for i, iface := range interfaces {
		list := lists[i]
		channels := map[string][]ccurpc.DeviceDescription{}
		for _, d := range list {
			if d.Parent != "" {
				channels[d.Parent] = append(channels[d.Parent], d)
			}
		}
		for _, d := range list {
			if d.Parent == "" {
				devices = append(devices, Device{InterfaceName: iface, Name: names[d.Address], DeviceDescription: d, Channels: channels[d.Address]})
			}
		}
	}
	s.sendJSON(client, listDevicesResponse{Type: "devices", RequestID: requestID, Devices: devices})
}

type putParamsetResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	Success   bool   `json:"success"`
}

// handlePutParamset changes device settings (MASTER). Administrators only;
// the values are checked against the description and recorded with their
// previous values.
func (s *Server) handlePutParamset(client *Client, message []byte) {
	rpc := s.rpcFor(client)
	var msg struct {
		paramsetRequest
		Values map[string]any `json:"values"`
	}
	if !s.decode(client, message, &msg) {
		return
	}

	entry := audit.Entry{
		User:   client.user,
		Action: "putParamset",
		Target: msg.InterfaceName + "." + msg.Address + "." + msg.ParamsetKey,
		Value:  msg.Values,
	}
	fail := func(code, errorMsg string) {
		s.recordAudit(entry, code)
		s.sendRequestError(client, msg.RequestID, errorMsg, code)
	}

	if code, errorMsg := configureError(client); code != "" {
		fail(code, errorMsg)
		return
	}
	if s.rpc == nil {
		fail("NOT_AVAILABLE", "putParamset is not available")
		return
	}
	// Only settings: VALUES are written one by one with setDatapoint
	if msg.ParamsetKey != ccurpc.ParamsetMaster {
		fail("INVALID_REQUEST", "only the MASTER paramset can be written")
		return
	}

	description, err := rpc.GetParamsetDescription(msg.InterfaceName, msg.Address, msg.ParamsetKey)
	if err != nil {
		fail("CCU_ERROR", "putParamset failed: "+err.Error())
		return
	}
	values, err := ccurpc.CoerceValues(description, msg.Values)
	if err != nil {
		fail("INVALID_VALUE", err.Error())
		return
	}

	if current, err := rpc.GetParamset(msg.InterfaceName, msg.Address, msg.ParamsetKey); err == nil {
		previous := map[string]any{}
		for name := range values {
			previous[name] = current[name]
		}
		entry.Previous = previous
	}
	entry.Value = values

	if err := rpc.PutParamset(msg.InterfaceName, msg.Address, msg.ParamsetKey, values); err != nil {
		fail("CCU_ERROR", "putParamset failed: "+err.Error())
		return
	}
	s.recordAudit(entry, "OK")
	if mode, ok := values["CHANNEL_OPERATION_MODE"]; ok {
		s.storeChannelMode(client, msg.InterfaceName, msg.Address, mode)
	}
	s.sendJSON(client, putParamsetResponse{Type: "putParamset_response", RequestID: msg.RequestID, Success: true})
}

// storeChannelMode remembers what an input channel is wired to after its
// CHANNEL_OPERATION_MODE was saved: the WebUI stores it as metadata
// "channelMode" in the interface process (Interface.setMetadata_crRFD,
// HmIP only) and in ReGa (Interface.setMetadata), where the status pages
// read it (webui.js, after saving MASTER; functions.fn). Failures are only
// logged: the setting itself is saved.
func (s *Server) storeChannelMode(client *Client, iface, address string, value any) {
	rpc := s.rpcFor(client)
	mode, ok := value.(int)
	if !ok {
		return
	}
	description, err := rpc.GetDeviceDescription(iface, address)
	if err != nil || description.Type != "MULTI_MODE_INPUT_TRANSMITTER" {
		return
	}
	if iface == "HmIP-RF" {
		if err := rpc.SetMetadata(iface, address, "channelMode", mode); err != nil {
			logger.Errorf("setMetadata channelMode %s: %v", address, err)
		}
	}
	if s.home != nil {
		if result, err := s.homeFor(client).SetChannelMode(iface, address, mode); err != nil || result != "OK" {
			logger.Errorf("SetChannelMode %s: %s %v", address, result, err)
		}
	}
}
