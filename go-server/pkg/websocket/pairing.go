package websocket

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/home"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
)

type interfacesResponse struct {
	Type       string   `json:"type"`
	RequestID  string   `json:"requestId,omitempty"`
	Success    bool     `json:"success"`
	Interfaces []string `json:"interfaces"`
}

type pairingResponse struct {
	Type      string             `json:"type"`
	RequestID string             `json:"requestId,omitempty"`
	Success   bool               `json:"success"`
	Seconds   *int               `json:"seconds,omitempty"`
	Devices   []rega.InboxDevice `json:"devices,omitempty"`
	// BidCos-RF: a device that failed to pair in install mode for another
	// system security key (getKeyMismatchDevice)
	KeyMismatch string `json:"keyMismatch,omitempty"`
	// HmIP-RF on openccu-lite: how the system pairs, so the dialog offers
	// what works
	HmIP *home.HmIPPairing `json:"hmip,omitempty"`
}

// hmipPairing is a home model that knows how the system pairs HmIP devices
// (openccu-lite)
type hmipPairing interface {
	HmIPPairing() (*home.HmIPPairing, error)
}

// handlePairing: pairing (install mode), the inbox of new devices and
// deleting devices. All of it is setup, for administrators only.
func (s *Server) handlePairing(client *Client, msgType string, message []byte) {
	rpc := s.rpcFor(client)
	var msg struct {
		RequestID     string `json:"requestId"`
		InterfaceName string `json:"interfaceName"`
		Address       string `json:"address"`
		On            bool   `json:"on"`
		Seconds       int    `json:"seconds"`
		// deleteDevice: reset the device to factory settings
		Reset bool `json:"reset"`
		// deleteDevice: delete even if it can't be reached
		Force bool `json:"force"`
		// replaceDevice: the device the new one (Address) replaces
		OldAddress string `json:"oldAddress"`
		// setInstallMode on HmIP: pair only this device with its local key,
		// without the key server (SGTIN and KEY from its label)
		SGTIN string `json:"sgtin"`
		Key   string `json:"key"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if s.rpc == nil {
		s.sendRequestError(client, msg.RequestID, msgType+" is not available", "NOT_AVAILABLE")
		return
	}

	// HmIP can't replace devices (ic_seldevice.cgi leaves HmIP out)
	if (msgType == "listReplaceableDevices" || msgType == "replaceDevice") && msg.InterfaceName == "HmIP-RF" {
		s.sendRequestError(client, msg.RequestID, "HmIP devices can't be replaced", "NOT_SUPPORTED")
		return
	}

	// Reading is allowed for administrators even without admin token
	switch msgType {
	case "listReplaceableDevices":
		if client.level != auth.LevelAdmin {
			s.sendRequestError(client, msg.RequestID, "only administrators may set up devices", "FORBIDDEN")
			return
		}
		devices, err := rpc.ListReplaceableDevices(msg.InterfaceName, msg.Address)
		if err != nil {
			s.sendRequestError(client, msg.RequestID, "listReplaceableDevices failed: "+err.Error(), "CCU_ERROR")
			return
		}
		s.sendJSON(client, replaceableResponse{Type: "listReplaceableDevices_response", RequestID: msg.RequestID, Devices: devices})
		return
	case "getInterfaces":
		// Which interfaces are connected: BidCos-Wired only with a Wired
		// gateway (InterfacesList.xml)
		if client.level != auth.LevelAdmin {
			s.sendRequestError(client, msg.RequestID, "only administrators may set up devices", "FORBIDDEN")
			return
		}
		s.sendJSON(client, interfacesResponse{Type: "getInterfaces_response", RequestID: msg.RequestID, Success: true, Interfaces: s.rpc.InterfaceNames()})
		return
	case "getInstallMode", "getInbox":
		if client.level != auth.LevelAdmin {
			s.sendRequestError(client, msg.RequestID, "only administrators may set up devices", "FORBIDDEN")
			return
		}
		response := pairingResponse{Type: msgType + "_response", RequestID: msg.RequestID, Success: true}
		if msgType == "getInstallMode" {
			seconds, err := rpc.GetInstallMode(msg.InterfaceName)
			if err != nil {
				s.sendRequestError(client, msg.RequestID, "getInstallMode failed: "+err.Error(), "CCU_ERROR")
				return
			}
			response.Seconds = &seconds
			if msg.InterfaceName == "BidCos-RF" {
				// As cp_add_device.cgi action_get_install_status; the CCU
				// forgets the device once it is read
				response.KeyMismatch, _ = rpc.KeyMismatchDevice(msg.InterfaceName, true)
			}
			if source, ok := s.home.(hmipPairing); ok && msg.InterfaceName == "HmIP-RF" {
				if pairing, err := source.HmIPPairing(); err == nil {
					response.HmIP = pairing
				} else {
					logger.Debugf("Reading how HmIP devices pair: %v", err)
				}
			}
		} else {
			devices, err := s.home.GetInbox()
			if err != nil {
				s.sendRequestError(client, msg.RequestID, "getInbox failed: "+err.Error(), "CCU_ERROR")
				return
			}
			response.Devices = devices
		}
		s.sendJSON(client, response)
		return
	}

	entry := audit.Entry{Action: msgType, Target: msg.InterfaceName + "." + msg.Address}
	switch msgType {
	case "setInstallMode":
		entry.Target = msg.InterfaceName
		entry.Value = map[string]interface{}{"on": msg.On, "seconds": msg.Seconds}
		if msg.SGTIN != "" || msg.Key != "" {
			// The key is never written to the audit log
			entry.Value = map[string]interface{}{"on": msg.On, "seconds": msg.Seconds, "sgtin": msg.SGTIN}
		}
		s.configure(client, msg.RequestID, entry, func() (interface{}, string, error) {
			if msg.On && (msg.SGTIN != "" || msg.Key != "") {
				if !strings.HasPrefix(msg.InterfaceName, "HmIP") {
					return nil, "", errors.New("invalid: only HmIP pairs with SGTIN and key")
				}
				sgtin, key, err := ccurpc.HmIPWhitelistEntry(msg.SGTIN, msg.Key)
				if err != nil {
					return nil, "", fmt.Errorf("invalid: %w", err)
				}
				return nil, rega.SetOK, rpc.SetInstallModeWithWhitelist(msg.InterfaceName, msg.Seconds, sgtin, key)
			}
			return nil, rega.SetOK, rpc.SetInstallMode(msg.InterfaceName, msg.On, msg.Seconds)
		})
	case "addDeviceBySerial":
		entry.Target = msg.InterfaceName + "." + strings.ToUpper(msg.Address)
		s.configure(client, msg.RequestID, entry, func() (interface{}, string, error) {
			if msg.InterfaceName != "BidCos-RF" {
				return nil, "", errors.New("invalid: only BidCos-RF pairs by serial number")
			}
			err := rpc.AddDevice(msg.InterfaceName, strings.ToUpper(strings.TrimSpace(msg.Address)))
			if errors.Is(err, ccurpc.ErrKeyMismatch) {
				return nil, "KEY_MISMATCH", nil
			}
			if errors.Is(err, ccurpc.ErrInvalidAddress) {
				return nil, "", errors.New("invalid serial number")
			}
			return nil, rega.SetOK, err
		})
	case "searchWiredDevices":
		entry.Target = "BidCos-Wired"
		s.configure(client, msg.RequestID, entry, func() (interface{}, string, error) {
			_, err := rpc.SearchDevices("BidCos-Wired")
			return nil, rega.SetOK, err
		})
	case "setTempKey":
		// The key itself is never written to the audit log
		entry.Target = msg.InterfaceName
		s.configure(client, msg.RequestID, entry, func() (interface{}, string, error) {
			if msg.InterfaceName != "BidCos-RF" || msg.Key == "" || len(msg.Key) > 64 || strings.ContainsAny(msg.Key, "\r\n") {
				return nil, "", errors.New("invalid temporary key")
			}
			return nil, rega.SetOK, rpc.SetTempKey(msg.InterfaceName, msg.Key)
		})
	case "acceptDevice":
		entry.Target = msg.Address
		s.configure(client, msg.RequestID, entry, func() (interface{}, string, error) {
			result, err := s.homeFor(client).AcceptDevice(msg.Address)
			return nil, result, err
		})
	case "replaceDevice":
		entry.Value = map[string]interface{}{"replaces": msg.OldAddress}
		s.configure(client, msg.RequestID, entry, func() (interface{}, string, error) {
			if code, _ := s.systemAdminError(client); code != "" {
				return nil, code, nil
			}
			if err := rpc.ReplaceDevice(msg.InterfaceName, msg.OldAddress, msg.Address); err != nil {
				return nil, "", err
			}
			s.rpc.Forget(msg.InterfaceName, msg.OldAddress)
			s.rpc.Forget(msg.InterfaceName, msg.Address)
			return nil, rega.SetOK, nil
		})
	case "deleteDevice":
		flags := 0
		if msg.Reset {
			flags |= ccurpc.DeleteReset
		}
		if msg.Force {
			flags |= ccurpc.DeleteForce
		}
		entry.Value = map[string]interface{}{"reset": msg.Reset, "force": msg.Force}
		s.configure(client, msg.RequestID, entry, func() (interface{}, string, error) {
			if code, _ := s.systemAdminError(client); code != "" {
				return nil, code, nil
			}
			if err := rpc.DeleteDevice(msg.InterfaceName, msg.Address, flags); err != nil {
				return nil, "", err
			}
			s.rpc.Forget(msg.InterfaceName, msg.Address)
			return nil, rega.SetOK, nil
		})
	}
}

type replaceableResponse struct {
	Type      string                     `json:"type"`
	RequestID string                     `json:"requestId,omitempty"`
	Devices   []ccurpc.DeviceDescription `json:"devices"`
}
