package settings

import (
	"bufio"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// LanGateway is a LAN gateway of the BidCos interfaces as the WebUI's
// BidcosRfPage lists it: the RF gateways from /etc/config/rfd.conf
// (BidCoS_RF.getConfigurationRF) and the Wired gateway from
// /etc/config/hs485d.conf (BidCoS_Wired.getConfigurationWired)
type LanGateway struct {
	// RF or Wired (globalGWClasses)
	Class string `json:"class"`
	// HMLGW2 (HomeMatic RF-LAN Gateway), Lan Interface (HM Configuration
	// Tool LAN) or HMWLGW (HomeMatic RS485 Gateway): globalLGWTypes
	Type   string `json:"type"`
	Name   string `json:"name"`
	Serial string `json:"serial"`
	// The access code (Lan Interface) or the passphrase
	Key string `json:"key"`
	IP  string `json:"ip"`
}

// The gateway types per class, as AddGatewayDialog offers them
var gatewayTypes = map[string][]string{
	"RF":    {"HMLGW2", "Lan Interface"},
	"Wired": {"HMWLGW"},
}

var (
	gatewaySerialRegex = regexp.MustCompile(`^[A-Z0-9]{1,20}$`)
	// KeyForbidden are the characters BidcosRfPage.Gateway
	// keyContainsNoForbiddenCharacter rejects in a new key
	KeyForbidden = `<>'"&$?[]{}#\`
)

// StatusDir holds the connection state of the gateways
// (/var/status/<serial>.connstat, Interface.getLGWConnectionStatus)
var StatusDir = "/var/status"

func readSections(path string) ([]map[string]string, error) {
	f, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var sections []map[string]string
	var current map[string]string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			current = map[string]string{}
			sections = append(sections, current)
			continue
		}
		if key, value, ok := strings.Cut(line, "="); ok && current != nil {
			current[strings.TrimSpace(key)] = strings.TrimSpace(value)
		}
	}
	return sections, scanner.Err()
}

// LanGateways reads the gateways of both interfaces; the CCU's own radio
// module (Type CCU2) is not one of them
func (s *Service) LanGateways() ([]LanGateway, error) {
	gateways := []LanGateway{}
	for _, source := range []struct{ file, class string }{{"rfd.conf", "RF"}, {"hs485d.conf", "Wired"}} {
		sections, err := readSections(s.path(source.file))
		if err != nil {
			return nil, err
		}
		for _, section := range sections {
			if section["Type"] == "" || section["Type"] == "CCU2" {
				continue
			}
			gateways = append(gateways, LanGateway{
				Class: source.class, Type: section["Type"], Name: section["Name"],
				Serial: section["Serial Number"], Key: section["Encryption Key"], IP: section["IP Address"],
			})
		}
	}
	return gateways, nil
}

// ValidKey is a new gateway key: not empty, without the characters the
// WebUI rejects or line breaks
func ValidKey(key string) bool {
	return key != "" && !strings.ContainsAny(key, KeyForbidden+"\r\n")
}

// ValidateGateways checks the gateways before they are written: known
// types, a serial number, at most one Wired gateway, an IP address if
// given, and nothing that breaks the lines of rfd.conf
func ValidateGateways(gateways []LanGateway) error {
	wired := 0
	serials := map[string]bool{}
	for _, g := range gateways {
		known := false
		for _, t := range gatewayTypes[g.Class] {
			known = known || t == g.Type
		}
		if !known {
			return fmt.Errorf("%w: gateway type %q", ErrInvalid, g.Type)
		}
		if !gatewaySerialRegex.MatchString(g.Serial) || serials[g.Serial] {
			return fmt.Errorf("%w: serial number %q", ErrInvalid, g.Serial)
		}
		serials[g.Serial] = true
		if g.Key == "" || strings.ContainsAny(g.Key+g.Name, "\r\n[]") {
			return fmt.Errorf("%w: key or name of %s", ErrInvalid, g.Serial)
		}
		if g.IP != "" && net.ParseIP(g.IP) == nil {
			return fmt.Errorf("%w: IP address of %s", ErrInvalid, g.Serial)
		}
		if g.Class == "Wired" {
			wired++
		}
	}
	if wired > 1 {
		return fmt.Errorf("%w: only one Wired gateway", ErrInvalid)
	}
	return nil
}

// GatewayConnState is the connection state the interface process writes
// for an HMLGW2 or HMWLGW: NO_ERROR, CONNECT_FAILED, WRONG_KEY; empty
// when there is none (the gateway is not active yet)
func GatewayConnState(serial string) string {
	if !gatewaySerialRegex.MatchString(serial) {
		return ""
	}
	data, err := os.ReadFile(filepath.Join(StatusDir, serial+".connstat"))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}
