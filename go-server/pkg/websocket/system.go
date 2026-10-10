package websocket

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"

	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/sysinfo"
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
	return versionFileValue("VERSION")
}

// versionFileValue reads KEY=value from the firmware's VERSION file
// (VERSION, PRODUCT and, on OpenCCU, PLATFORM)
func versionFileValue(key string) string {
	f, err := os.Open(firmwareVersionFile)
	if err != nil {
		return ""
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		if value, ok := strings.CutPrefix(strings.TrimSpace(scanner.Text()), key+"="); ok {
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
	// As the WebUI's help page (help.cgi): product and platform from
	// /VERSION, the ReGaHss version and, on the CCU, its system state
	Product   string        `json:"product,omitempty"`
	Platform  string        `json:"platform,omitempty"`
	RegaBuild string        `json:"regaBuild,omitempty"`
	System    *sysinfo.Info `json:"system,omitempty"`
}

// handleSystemInfo: versions and the radio modules with their duty cycle,
// for administrators.
func (s *Server) handleSystemInfo(client *Client, requestID string) {
	rpc := s.rpcFor(client)
	if client.level != auth.LevelAdmin {
		s.sendRequestError(client, requestID, "only administrators may see system information", "FORBIDDEN")
		return
	}
	response := systemInfoResponse{
		Type: "getSystemInfo_response", RequestID: requestID, Success: true,
		AddonVersion: addonVersion(), FirmwareVersion: firmwareVersion(), RadioInterfaces: []radioInterface{},
		Product: versionFileValue("PRODUCT"), Platform: versionFileValue("PLATFORM"),
	}
	response.RegaBuild = s.regaBuild()
	// Only on the CCU itself: elsewhere it would describe the add-on's host
	if response.FirmwareVersion != "" {
		info := sysinfo.Read()
		response.System = &info
	}
	if s.rpc != nil {
		// The interfaces the WebUI asks for their modules (showAllInterfaces
		// in webui.js): the groups server (VirtualDevices) answers
		// listBidcosInterfaces with a fault the CCU logs in hmserver.log
		for _, iface := range []string{"BidCos-RF", "BidCos-Wired", "HmIP-RF"} {
			modules, err := rpc.ListBidcosInterfaces(iface)
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
