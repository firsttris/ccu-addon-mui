package fakeccu

import (
	"fmt"
	"slices"
	"strings"
	"time"
)

// The XML-RPC methods of the fake's interface processes (BidCos-RF, HmIP-RF,
// VirtualDevices …), by name. A method gets the interface, its data and the
// call's parameters and answers with a value or a fault message.
type rpcMethod func(c *CCU, iface string, data *InterfaceData, params []any) (any, string)

var rpcMethods = map[string]rpcMethod{
	"system.listMethods": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		return []string{"init", "ping", "listDevices", "getDeviceDescription", "getParamsetDescription", "getParamset",
			"putParamset", "setValue", "setMetadata", "setInstallMode", "getInstallMode", "deleteDevice", "getLinks", "addLink", "removeLink"}, ""
	},
	"setInstallMode": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		on, _ := params[0].(bool)
		seconds := 60
		if len(params) > 1 {
			if n, ok := params[1].(int); ok {
				seconds = n
			}
		}
		if on {
			c.installModeUntil[iface] = time.Now().Add(time.Duration(seconds) * time.Second)
		} else {
			delete(c.installModeUntil, iface)
		}
		return "", ""
	},
	"setInstallModeWithWhitelist": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		seconds, _ := paramAt(params, 1).(int)
		c.installModeUntil[iface] = time.Now().Add(time.Duration(seconds) * time.Second)
		c.Whitelist = nil
		list, _ := paramAt(params, 2).([]any)
		for _, item := range list {
			if entry, ok := item.(map[string]any); ok {
				c.Whitelist = append(c.Whitelist, entry)
				// The device answers at once: into the inbox, its address
				// from the SGTIN
				if sgtin := fmt.Sprint(entry["ADDRESS"]); len(sgtin) == 24 {
					c.addInboxDevice(iface, sgtin[10:], "HmIP-PSM")
				}
			}
		}
		return "", ""
	},
	"addDevice": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		serial := stringParam(params, 0)
		if strings.HasPrefix(serial, "KEQ") && c.tempKey == "" {
			c.keyMismatch = serial
			return nil, "-7:key mismatch"
		}
		if strings.HasPrefix(serial, "KEQ") {
			// The temporary key served this device
			c.tempKey = ""
		}
		c.addInboxDevice(iface, serial, "HM-LC-Sw1-FM")
		c.calls["addDevice"]++
		return map[string]any{"ADDRESS": serial, "TYPE": "HM-LC-Sw1-FM"}, ""
	},
	"getKeyMismatchDevice": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		serial := c.keyMismatch
		if b, _ := paramAt(params, 0).(bool); b {
			c.keyMismatch = ""
		}
		return serial, ""
	},
	"setTempKey": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		c.tempKey = stringParam(params, 0)
		return "", ""
	},
	"getInstallMode": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		remaining := time.Until(c.installModeUntil[iface])
		if remaining < 0 {
			remaining = 0
		}
		return int(remaining.Seconds()), ""
	},
	"installFirmware": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		// HmIP: the delivered firmware is installed (on a live update the
		// access point stays online: LIVE_UP_TO_DATE)
		address := stringParam(params, 0)
		for _, d := range data.Devices {
			if d["ADDRESS"] != address {
				continue
			}
			state, _ := d["FIRMWARE_UPDATE_STATE"].(string)
			switch state {
			case "READY_FOR_UPDATE", "DO_UPDATE_PENDING":
				d["FIRMWARE_UPDATE_STATE"] = "UP_TO_DATE"
			case "LIVE_NEW_FIRMWARE_AVAILABLE":
				d["FIRMWARE_UPDATE_STATE"] = "LIVE_UP_TO_DATE"
			default:
				return nil, "-5:Firmware update not ready"
			}
			d["FIRMWARE"] = d["AVAILABLE_FIRMWARE"]
			return true, ""
		}
		return nil, "-2:Unknown instance"
	},
	"refreshDeployedDeviceFirmwareList": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		c.refreshFirmware(iface, data)
		return true, ""
	},
	"updateFirmware": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		// BidCos: transfers and installs the firmware the CCU has. A device
		// that is not always listening (RX_MODE without ALWAYS) has to be
		// woken with its key; the fake one never is: fault -1, as the
		// WebUI's ic_ifacecmd.cgi expects it.
		address := stringParam(params, 0)
		for _, d := range data.Devices {
			if d["ADDRESS"] != address {
				continue
			}
			available, _ := d["AVAILABLE_FIRMWARE"].(string)
			if available == "" || available == d["FIRMWARE"] {
				return nil, "-5:No firmware update available"
			}
			rxMode := 1
			switch v := d["RX_MODE"].(type) {
			case float64:
				rxMode = int(v)
			case int:
				rxMode = v
			}
			if rxMode&1 == 0 {
				return nil, "-1:Bootloader in device " + address + " didn't start"
			}
			d["FIRMWARE"] = available
			// rfd answers a plain bool (XmlRpcMethods updateFirmware)
			return true, ""
		}
		return nil, "-2:Unknown instance"
	},
	"listReplaceableDevices": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		// Devices of the new device's type that are set up (not in the inbox)
		newAddress := stringParam(params, 0)
		var newType any
		for _, d := range data.Devices {
			if d["ADDRESS"] == newAddress {
				newType = d["TYPE"]
			}
		}
		if newType == nil {
			return nil, "Unknown instance"
		}
		list := []any{}
		for _, d := range data.Devices {
			if parent, _ := d["PARENT"].(string); parent == "" && d["TYPE"] == newType && d["ADDRESS"] != newAddress && !slices.Contains(c.fixture.Inbox, fmt.Sprint(d["ADDRESS"])) {
				list = append(list, d)
			}
		}
		return list, ""
	},
	"replaceDevice": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		if !c.replaceDevice(iface, stringParam(params, 0), stringParam(params, 1)) {
			return nil, "Unknown instance"
		}
		return "", ""
	},
	"deleteDevice": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		if !c.deleteDevice(iface, stringParam(params, 0)) {
			return nil, "Unknown instance"
		}
		return "", ""
	},
	"init": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		url, id := stringParam(params, 0), stringParam(params, 1)
		if c.callbacks[iface] == nil {
			c.callbacks[iface] = map[string]string{}
		}
		if id == "" {
			for existing, u := range c.callbacks[iface] {
				if u == url {
					delete(c.callbacks[iface], existing)
				}
			}
		} else {
			c.callbacks[iface][id] = url
		}
		return "", ""
	},
	"ping": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		id := stringParam(params, 0)
		if url, ok := c.callbacks[iface][id]; ok {
			c.events <- callbackEvent{url: url, interfaceID: id, address: "CENTRAL", datapoint: "PONG", value: id}
		}
		return true, ""
	},
	"listDevices": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		if data.RadioInterfaces != nil {
			// BidCos-RF devices carry their radio module, at first the
			// default one
			for _, d := range data.Devices {
				if d["PARENT"] == nil && d["INTERFACE"] == nil {
					for _, m := range data.RadioInterfaces {
						if m["DEFAULT"] == true {
							d["INTERFACE"], d["ROAMING"] = m["ADDRESS"], 0
						}
					}
				}
			}
		}
		if c.Lite {
			// The central's own virtual keys, as rfd and HMIPServer list them
			return append(append([]map[string]any{}, data.Devices...), c.virtualKeyDevices(iface)...), ""
		}
		return data.Devices, ""
	},
	"setBidcosInterface": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		roaming := 0
		if b, _ := paramAt(params, 2).(bool); b {
			roaming = 1
		}
		for _, d := range data.Devices {
			if d["ADDRESS"] == stringParam(params, 0) {
				d["INTERFACE"], d["ROAMING"] = stringParam(params, 1), roaming
				c.calls["setBidcosInterface"]++
				return true, ""
			}
		}
		return nil, "Unknown instance"
	},
	"setMetadata": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		if c.metadata[iface] == nil {
			c.metadata[iface] = map[string]any{}
		}
		c.metadata[iface][stringParam(params, 0)+"/"+stringParam(params, 1)] = paramAt(params, 2)
		return "", ""
	},
	"searchDevices": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		// hs485d looks for new devices on the RS485 bus; they land in the
		// inbox (cp_add_device.cgi action_wir_search)
		if iface != "BidCos-Wired" {
			return nil, "Unknown method"
		}
		c.addInboxDevice(iface, fmt.Sprintf("LEQ%07d", 9100000+len(c.fixture.Inbox)), "HMW-LC-Sw2-DR")
		return 1, ""
	},
	"getDeviceDescription": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		for _, d := range data.Devices {
			if d["ADDRESS"] == stringParam(params, 0) {
				return d, ""
			}
		}
		return nil, "Unknown instance"
	},
	"getParamsetDescription": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		address, key := stringParam(params, 0), stringParam(params, 1)
		description, ok := data.ParamsetDescriptions[address][key]
		if !ok && c.Lite && isVirtualKey(address) && key == "VALUES" {
			description, ok = virtualKeyValues, true
		}
		if !ok && strings.Contains(key, ":") {
			// Link parameters: the same for every partner
			description, ok = data.ParamsetDescriptions[address]["LINK"]
		}
		if !ok {
			return nil, "Unknown paramset"
		}
		if description == nil {
			// Older exports wrote empty paramsets as null
			description = map[string]any{}
		}
		return description, ""
	},
	"getParamset": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		address, key := stringParam(params, 0), stringParam(params, 1)
		if key == "VALUES" {
			if ch := c.channelByAddress(iface, address); ch != nil {
				return ch.Datapoints, ""
			}
		}
		if values, ok := data.Paramsets[address][key]; ok {
			return values, ""
		}
		if description, ok := data.ParamsetDescriptions[address]["LINK"]; ok && strings.Contains(key, ":") {
			defaults := map[string]any{}
			for name, raw := range description {
				if p, ok := raw.(map[string]any); ok {
					defaults[name] = p["DEFAULT"]
				}
			}
			return defaults, ""
		}
		return nil, "Unknown paramset"
	},
	"logLevel": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		if c.rpcLogLevels == nil {
			c.rpcLogLevels = map[string]int{}
		}
		if len(params) > 0 {
			level, ok := params[0].(int)
			if !ok {
				return nil, "logLevel expects an integer"
			}
			c.rpcLogLevels[iface] = level
			return level, ""
		}
		if level, ok := c.rpcLogLevels[iface]; ok {
			return level, ""
		}
		return 2, ""
	},
	"listBidcosInterfaces": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		if data.RadioInterfaces == nil {
			return nil, "Unknown method listBidcosInterfaces"
		}
		return append(append([]map[string]any{}, data.RadioInterfaces...), c.lanGatewayModules(iface)...), ""
	},
	"getLinks": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		address := stringParam(params, 0)
		links := []any{}
		for _, link := range data.Links {
			for _, end := range []any{link["SENDER"], link["RECEIVER"]} {
				// An empty address asks for all links
				if address == "" || end == address || deviceAddress(fmt.Sprint(end)) == address {
					links = append(links, link)
					break
				}
			}
		}
		return links, ""
	},
	"addLink": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		data.Links = append(data.Links, map[string]any{
			"SENDER": stringParam(params, 0), "RECEIVER": stringParam(params, 1),
			"NAME": stringParam(params, 2), "DESCRIPTION": stringParam(params, 3), "FLAGS": 0,
		})
		return "", ""
	},
	"removeLink": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		kept := data.Links[:0]
		removed := false
		for _, link := range data.Links {
			if link["SENDER"] == stringParam(params, 0) && link["RECEIVER"] == stringParam(params, 1) {
				removed = true
				continue
			}
			kept = append(kept, link)
		}
		data.Links = kept
		if !removed {
			return nil, "Unknown link"
		}
		return "", ""
	},
	"setValue": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		ch := c.channelByAddress(iface, stringParam(params, 0))
		if ch == nil || len(params) < 3 {
			return nil, "Unknown instance"
		}
		c.setValue(ch, stringParam(params, 1), params[2])
		return "", ""
	},
	"putParamset": func(c *CCU, iface string, data *InterfaceData, params []any) (any, string) {
		address, key := stringParam(params, 0), stringParam(params, 1)
		values, _ := params[len(params)-1].(map[string]any)
		if key == "VALUES" {
			ch := c.channelByAddress(iface, address)
			if ch == nil {
				return nil, "Unknown instance"
			}
			for name, v := range values {
				c.setValue(ch, name, v)
			}
			return "", ""
		}
		if data.Paramsets == nil {
			data.Paramsets = map[string]map[string]map[string]any{}
		}
		if data.Paramsets[address] == nil {
			data.Paramsets[address] = map[string]map[string]any{}
		}
		if data.Paramsets[address][key] == nil {
			data.Paramsets[address][key] = map[string]any{}
		}
		for name, v := range values {
			data.Paramsets[address][key][name] = v
		}
		if key == "MASTER" {
			c.markConfigPending(iface, deviceAddress(address))
		}
		return "", ""
	},
}
