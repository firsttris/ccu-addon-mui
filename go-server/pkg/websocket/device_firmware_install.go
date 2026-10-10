package websocket

import (
	"encoding/json"
	"errors"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
)

// handleInstallFirmware starts the update of a device to the firmware the
// CCU has for it. Setup, for administrators only. DEVICE_UNREACHABLE asks
// to wake the device, DUTY_CYCLE_HIGH to try again later.
func (s *Server) handleInstallFirmware(client *Client, message []byte) {
	var msg struct {
		RequestID     string `json:"requestId"`
		InterfaceName string `json:"interfaceName"`
		Address       string `json:"address"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if s.rpc == nil {
		s.sendRequestError(client, msg.RequestID, "installFirmware is not available", "NOT_AVAILABLE")
		return
	}
	// One update per device: a second updateFirmware would hit a device
	// that is in its bootloader for the first
	if _, running := s.firmwareUpdates.LoadOrStore(msg.InterfaceName+" "+msg.Address, true); running {
		s.sendRequestError(client, msg.RequestID, "an update of this device is already running", "UPDATE_RUNNING")
		return
	}
	// A BidCos update answers only after minutes: the client's other
	// requests go on meanwhile, as in the WebUI the answer is waited for
	go s.installFirmware(client.snapshot(), msg.RequestID, msg.InterfaceName, msg.Address)
}

func (s *Server) installFirmware(client *Client, requestID, iface, address string) {
	rpc := s.rpcFor(client)
	key := iface + " " + address
	defer s.firmwareUpdates.Delete(key)
	s.configure(client, requestID, audit.Entry{Action: "installFirmware", Target: key},
		func() (any, string, error) {
			if code, _ := s.systemAdminError(client); code != "" {
				return nil, code, nil
			}
			err := rpc.InstallFirmware(iface, address)
			// Free the device before the answer goes out: a start sent
			// right after it would otherwise still get UPDATE_RUNNING
			s.firmwareUpdates.Delete(key)
			if err == nil {
				s.smokeTestAfterUpdate(client, iface, address)
			}
			switch {
			case errors.Is(err, ccurpc.ErrDeviceUnreachable):
				return nil, "DEVICE_UNREACHABLE", nil
			case errors.Is(err, ccurpc.ErrDutyCycleHigh):
				return nil, "DUTY_CYCLE_HIGH", nil
			case err != nil:
				return nil, "", err
			}
			return nil, rega.SetOK, nil
		})
}

// smokeTestAfterUpdate: a smoke detector asks for its self-test after a
// firmware update, as the WebUI resets it (ic_ifacecmd.cgi: metadata
// smokeTestDone=false on <address>:1, hintActivateDetectorSelfTest)
func (s *Server) smokeTestAfterUpdate(client *Client, iface, address string) {
	rpc := s.rpcFor(client)
	device, err := rpc.GetDeviceDescription(iface, address)
	if err != nil || (device.Type != "HmIP-SWSD" && device.Type != "HmIP-SWSD-2") {
		return
	}
	if err := rpc.SetMetadata("HmIP-RF", address+":1", "smokeTestDone", false); err != nil {
		logger.Error("Failed to reset smokeTestDone:", err)
	}
}
