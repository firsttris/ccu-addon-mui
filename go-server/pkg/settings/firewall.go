package settings

import (
	"bufio"
	"errors"
	"fmt"
	"net"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Firewall is the CCU's firewall as libfirewall.tcl keeps it in
// /etc/config/firewall.conf (Firewall_loadConfiguration) and the WebUI's
// FirewallConfigDialog shows it
type Firewall struct {
	// MOST_OPEN (every port open, the services as set) or RESTRICTIVE
	// (only the web interface and the services as set)
	Mode     string            `json:"mode"`
	Services []FirewallService `json:"services"`
	// IP addresses and networks for restricted access
	IPs []string `json:"ips"`
	// Ports opened besides the services
	UserPorts []string `json:"userPorts"`
}

// FirewallService is a group of ports with its access: full, restricted
// (only from IPs) or none
type FirewallService struct {
	ID     string `json:"id"`
	Ports  []int  `json:"ports"`
	Access string `json:"access"`
}

// The services and their ports as libfirewall.tcl defines them
var firewallServices = map[string][]int{
	"XMLRPC":    {2000, 2001, 2002, 2010, 9292, 42000, 42001, 42010, 49292},
	"REGA":      {8181, 1999, 48181, 41999},
	"NEOSERVER": {8088, 9099, 1901, 1902, 5987, 10000, 48899, 49880},
	"SNMP":      {161},
}

// FirewallEditable are the services the WebUI's dialog changes (SNMP has
// its own setting)
var FirewallEditable = []string{"XMLRPC", "REGA", "NEOSERVER"}

var (
	ErrNoFirewall = errors.New("no firewall configuration")
	accessLevels  = map[string]bool{"full": true, "restricted": true, "none": true}
	portRegex     = regexp.MustCompile(`^\d{1,5}$`)
)

// Firewall reads /etc/config/firewall.conf
func (s *Service) Firewall() (Firewall, error) {
	f, err := os.Open(s.path("firewall.conf"))
	if errors.Is(err, os.ErrNotExist) {
		return Firewall{}, ErrNoFirewall
	}
	if err != nil {
		return Firewall{}, err
	}
	defer f.Close()
	fw := Firewall{Mode: "RESTRICTIVE", IPs: []string{}, UserPorts: []string{}}
	services := map[string]*FirewallService{}
	for id, ports := range firewallServices {
		services[id] = &FirewallService{ID: id, Ports: append([]int{}, ports...), Access: "none"}
	}
	section := ""
	var current *FirewallService
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			section = strings.Trim(line, "[]")
			current = nil
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key, value = strings.TrimSpace(key), strings.TrimSpace(value)
		if section == "" {
			switch key {
			case "MODE":
				fw.Mode = value
			case "IPs":
				fw.IPs = strings.Fields(value)
			case "USERPORTS":
				fw.UserPorts = strings.Fields(value)
			}
			continue
		}
		switch key {
		case "Id":
			if services[value] == nil {
				services[value] = &FirewallService{ID: value}
			}
			current = services[value]
		case "Ports":
			if current != nil {
				// The ports in the file and those defined since (migration)
				for _, p := range strings.Fields(value) {
					if n, err := strconv.Atoi(p); err == nil && !containsInt(current.Ports, n) {
						current.Ports = append(current.Ports, n)
					}
				}
			}
		case "Access":
			if current != nil {
				current.Access = value
			}
		}
	}
	for _, service := range services {
		sort.Ints(service.Ports)
		fw.Services = append(fw.Services, *service)
	}
	sort.Slice(fw.Services, func(i, j int) bool { return fw.Services[i].ID < fw.Services[j].ID })
	return fw, scanner.Err()
}

func containsInt(list []int, v int) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

// ValidFirewallAddress is an IP address or network (FirewallConfigDialog:
// "1.2.3.4" or "1.2.3.0/8"; IPv6 as libfirewall.tcl takes it too)
func ValidFirewallAddress(text string) bool {
	if _, _, err := net.ParseCIDR(text); err == nil {
		return true
	}
	return net.ParseIP(text) != nil
}

// Validate checks a firewall before it is set
func (fw Firewall) Validate() error {
	if fw.Mode != "MOST_OPEN" && fw.Mode != "RESTRICTIVE" {
		return fmt.Errorf("%w: mode", ErrInvalid)
	}
	for _, s := range fw.Services {
		if !accessLevels[s.Access] {
			return fmt.Errorf("%w: access of %s", ErrInvalid, s.ID)
		}
	}
	for _, ip := range fw.IPs {
		if !ValidFirewallAddress(ip) {
			return fmt.Errorf("%w: address %s", ErrInvalid, ip)
		}
	}
	for _, p := range fw.UserPorts {
		n, err := strconv.Atoi(p)
		if !portRegex.MatchString(p) || err != nil || n < 1 || n > 65535 {
			return fmt.Errorf("%w: port %s", ErrInvalid, p)
		}
	}
	return nil
}
