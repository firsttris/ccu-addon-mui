package websocket

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"

	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/ccurpc"
)

// Where the CCU (CCU3, OpenCCU) keeps its firmware version, as VERSION=...
var firmwareVersionFile = "/VERSION"

// addonVersion reads the add-on's VERSION file, which the installer puts
// next to the go-server directory.
func addonVersion() string {
	executable, err := os.Executable()
	if err != nil {
		return ""
	}
	data, err := os.ReadFile(filepath.Join(filepath.Dir(executable), "..", "VERSION"))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

func firmwareVersion() string {
	f, err := os.Open(firmwareVersionFile)
	if err != nil {
		return ""
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		if value, ok := strings.CutPrefix(strings.TrimSpace(scanner.Text()), "VERSION="); ok {
			return value
		}
	}
	return ""
}

type radioInterface struct {
	InterfaceName string `json:"interfaceName"`
	ccurpc.RadioInterface
}

type systemInfoResponse struct {
	Type            string           `json:"type"`
	RequestID       string           `json:"requestId,omitempty"`
	Success         bool             `json:"success"`
	AddonVersion    string           `json:"addonVersion,omitempty"`
	FirmwareVersion string           `json:"firmwareVersion,omitempty"`
	RadioInterfaces []radioInterface `json:"radioInterfaces"`
}

// handleSystemInfo: versions and the radio modules with their duty cycle,
// for administrators.
func (s *Server) handleSystemInfo(client *Client, requestID string) {
	if client.level != auth.LevelAdmin {
		s.sendRequestError(client, requestID, "only administrators may see system information", "FORBIDDEN")
		return
	}
	response := systemInfoResponse{
		Type: "getSystemInfo_response", RequestID: requestID, Success: true,
		AddonVersion: addonVersion(), FirmwareVersion: firmwareVersion(), RadioInterfaces: []radioInterface{},
	}
	if s.rpc != nil {
		for _, iface := range s.rpc.InterfaceNames() {
			// Not every interface has radio modules (VirtualDevices)
			modules, err := s.rpc.ListBidcosInterfaces(iface)
			if err != nil {
				continue
			}
			for _, m := range modules {
				response.RadioInterfaces = append(response.RadioInterfaces, radioInterface{InterfaceName: iface, RadioInterface: m})
			}
		}
	}
	s.sendJSON(client, response)
}
