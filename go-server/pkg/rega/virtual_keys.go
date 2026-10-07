package rega

import (
	"ccu-addon-mui-server/pkg/home"
	"strconv"
	"strings"
)

// VirtualKey is a virtual key of the CCU (HM-RCV-50, HmIP-RCV-50).
type VirtualKey = home.VirtualKey

// GetVirtualKeys lists the CCU's virtual keys (get_virtual_keys.tcl).
func (c *Client) GetVirtualKeys() ([]VirtualKey, error) {
	output, err := c.Execute(getVirtualKeysScript)
	if err != nil {
		return nil, err
	}
	return parseVirtualKeys(output), nil
}

func parseVirtualKeys(output string) []VirtualKey {
	keys := []VirtualKey{}
	for _, line := range strings.Split(output, "\n") {
		fields := strings.SplitN(strings.TrimRight(line, "\r"), "\t", 6)
		if len(fields) < 6 || fields[0] != "K" {
			continue
		}
		id, err := strconv.ParseInt(fields[1], 10, 64)
		if err != nil {
			continue
		}
		programs, _ := strconv.Atoi(fields[4])
		keys = append(keys, VirtualKey{ID: id, Address: fields[2], InterfaceName: fields[3], Programs: programs, Name: fields[5]})
	}
	return keys
}
