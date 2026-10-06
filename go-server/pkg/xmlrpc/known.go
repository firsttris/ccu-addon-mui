package xmlrpc

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"sync"
)

// knownDevices are the devices each interface reported with newDevices, by
// interface ID, with their VERSION. On init, an interface first asks
// listDevices what the callback knows and then sends newDevices only for
// what is missing or has another version, and deleteDevices for what it no
// longer has (OpenCCU-Base libhsscomm/HSSManager.cpp, PlatformInit). With
// an empty answer every re-registration brings all device descriptions
// again: several MB on a CCU with many devices.
type knownDevices struct {
	mu          sync.Mutex
	byInterface map[string]map[string]int
}

func (k *knownDevices) add(interfaceID string, versions map[string]int) {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.byInterface == nil {
		k.byInterface = map[string]map[string]int{}
	}
	if k.byInterface[interfaceID] == nil {
		k.byInterface[interfaceID] = map[string]int{}
	}
	for address, version := range versions {
		k.byInterface[interfaceID][address] = version
	}
}

func (k *knownDevices) remove(interfaceID string, addresses []string) {
	k.mu.Lock()
	defer k.mu.Unlock()
	for _, address := range addresses {
		delete(k.byInterface[interfaceID], address)
	}
}

// response is the answer to listDevices: ADDRESS and VERSION of each known
// device, which is all the interface compares
func (k *knownDevices) response(interfaceID string) string {
	k.mu.Lock()
	defer k.mu.Unlock()
	var items bytes.Buffer
	for address, version := range k.byInterface[interfaceID] {
		items.WriteString("<value><struct><member><name>ADDRESS</name><value><string>")
		_ = xml.EscapeText(&items, []byte(address))
		fmt.Fprintf(&items, "</string></value></member><member><name>VERSION</name><value><i4>%d</i4></value></member></struct></value>", version)
	}
	return fmt.Sprintf(`<?xml version="1.0"?>
<methodResponse>
<params>
<param>
<value>
<array>
<data>
%s
</data>
</array>
</value>
</param>
</params>
</methodResponse>`, items.String())
}

// newDeviceVersions takes the params of newDevices(interfaceID,
// descriptions) and returns the interface ID and ADDRESS -> VERSION.
func newDeviceVersions(params []param) (string, map[string]int) {
	if len(params) < 2 || params[0].Value.String == nil && params[0].Value.Text == "" {
		return "", nil
	}
	interfaceID := params[0].Value.Text
	if params[0].Value.String != nil {
		interfaceID = *params[0].Value.String
	}
	versions := map[string]int{}
	if params[1].Value.Array == nil {
		return interfaceID, versions
	}
	for _, description := range params[1].Value.Array.Data.Value {
		if description.Struct == nil {
			continue
		}
		address, version := "", 0
		for _, m := range description.Struct.Member {
			switch m.Name {
			case "ADDRESS":
				if m.Value.String != nil {
					address = *m.Value.String
				} else {
					address = m.Value.Text
				}
			case "VERSION":
				if m.Value.I4 != nil {
					version = *m.Value.I4
				} else if m.Value.Int != nil {
					version = *m.Value.Int
				}
			}
		}
		if address != "" {
			versions[address] = version
		}
	}
	return interfaceID, versions
}
