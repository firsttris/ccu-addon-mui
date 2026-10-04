package settings

import (
	"bufio"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
)

// NetConfig is the CCU's network setup in /etc/config/netconfig, as the
// WebUI's cp_network.cgi reads and writes it (read_config, write_config)
type NetConfig struct {
	DHCP     bool   `json:"dhcp"`
	Hostname string `json:"hostname"`
	IP       string `json:"ip"`
	Netmask  string `json:"netmask"`
	Gateway  string `json:"gateway"`
	DNS1     string `json:"dns1"`
	DNS2     string `json:"dns2"`
}

// NetState is what the network interface uses right now
// (get_current_config: ifconfig eth0, /proc/net/route)
type NetState struct {
	IP      string `json:"ip"`
	Netmask string `json:"netmask"`
	Gateway string `json:"gateway"`
	MAC     string `json:"mac,omitempty"`
}

var (
	ErrNoNetConfig = errors.New("no network configuration")
	hostnameRegex  = regexp.MustCompile(`^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$`)
)

func readProperties(data string) map[string]string {
	props := map[string]string{}
	for _, line := range strings.Split(data, "\n") {
		key, value, ok := strings.Cut(line, "=")
		if ok {
			props[strings.TrimSpace(key)] = value
		}
	}
	return props
}

// setProperty replaces a line KEY=... or adds it, as set_property
func setProperty(data, key, value string) string {
	lines := strings.Split(data, "\n")
	for i, line := range lines {
		if k, _, ok := strings.Cut(line, "="); ok && strings.TrimSpace(k) == key {
			lines[i] = key + "=" + value
			return strings.Join(lines, "\n")
		}
	}
	if data != "" && !strings.HasSuffix(data, "\n") {
		data += "\n"
	}
	return data + key + "=" + value + "\n"
}

// NetConfig reads /etc/config/netconfig
func (s *Service) NetConfig() (NetConfig, error) {
	data, err := os.ReadFile(s.path("netconfig"))
	if errors.Is(err, os.ErrNotExist) {
		return NetConfig{}, ErrNoNetConfig
	}
	if err != nil {
		return NetConfig{}, err
	}
	p := readProperties(string(data))
	return NetConfig{
		DHCP: p["MODE"] == "DHCP", Hostname: p["HOSTNAME"], IP: p["IP"], Netmask: p["NETMASK"],
		Gateway: p["GATEWAY"], DNS1: p["NAMESERVER1"], DNS2: p["NAMESERVER2"],
	}, nil
}

func validIPv4(text string) bool {
	ip := net.ParseIP(text)
	return ip != nil && ip.To4() != nil && strings.Count(text, ".") == 3
}

// validNetmask is a contiguous IPv4 mask (isSubnetMaskValid)
func validNetmask(text string) bool {
	if !validIPv4(text) {
		return false
	}
	ones, bits := net.IPMask(net.ParseIP(text).To4()).Size()
	return bits == 32 && ones > 0
}

// Validate checks a network setup before it is written: the hostname
// always, the addresses for a manual setup (cp_network.cgi checkIPAddress,
// isNetMaskValid); the gateway must be in the network
func (c NetConfig) Validate() error {
	if !hostnameRegex.MatchString(c.Hostname) {
		return fmt.Errorf("%w: hostname", ErrInvalid)
	}
	if c.DHCP {
		return nil
	}
	if !validIPv4(c.IP) || !validNetmask(c.Netmask) || !validIPv4(c.Gateway) {
		return fmt.Errorf("%w: address", ErrInvalid)
	}
	for _, dns := range []string{c.DNS1, c.DNS2} {
		if dns != "" && !validIPv4(dns) {
			return fmt.Errorf("%w: name server", ErrInvalid)
		}
	}
	mask := net.IPMask(net.ParseIP(c.Netmask).To4())
	if !net.ParseIP(c.IP).Mask(mask).Equal(net.ParseIP(c.Gateway).Mask(mask)) {
		return fmt.Errorf("%w: gateway outside the network", ErrInvalid)
	}
	return nil
}

// SetNetConfig writes /etc/config/netconfig, keeping its other lines; in
// DHCP mode the addresses stay as they are. The CCU uses it on its next
// start.
func (s *Service) SetNetConfig(c NetConfig) error {
	if err := c.Validate(); err != nil {
		return err
	}
	data, err := os.ReadFile(s.path("netconfig"))
	if err != nil {
		return err
	}
	text := string(data)
	mode := "MANUAL"
	if c.DHCP {
		mode = "DHCP"
	}
	text = setProperty(text, "MODE", mode)
	text = setProperty(text, "HOSTNAME", c.Hostname)
	if !c.DHCP {
		text = setProperty(text, "IP", c.IP)
		text = setProperty(text, "NETMASK", c.Netmask)
		text = setProperty(text, "GATEWAY", c.Gateway)
		text = setProperty(text, "NAMESERVER1", c.DNS1)
		text = setProperty(text, "NAMESERVER2", c.DNS2)
	}
	return writeFile(s.path("netconfig"), text)
}

// NetState reads the address of eth0 and the default gateway; routeFile
// is /proc/net/route
func NetStateOf(iface, routeFile string) NetState {
	var st NetState
	if i, err := net.InterfaceByName(iface); err == nil {
		st.MAC = i.HardwareAddr.String()
		if addrs, err := i.Addrs(); err == nil {
			for _, a := range addrs {
				if n, ok := a.(*net.IPNet); ok && n.IP.To4() != nil {
					st.IP = n.IP.String()
					st.Netmask = net.IP(n.Mask).String()
					break
				}
			}
		}
	}
	f, err := os.Open(routeFile)
	if err != nil {
		return st
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		// Iface Destination Gateway ...: the default route of the interface
		if len(fields) >= 3 && fields[0] == iface && fields[1] == "00000000" {
			if gw, err := strconv.ParseUint(fields[2], 16, 32); err == nil {
				st.Gateway = fmt.Sprintf("%d.%d.%d.%d", gw&0xff, gw>>8&0xff, gw>>16&0xff, gw>>24)
			}
		}
	}
	return st
}

// The Tailscale VPN of OpenCCU (cp_network.cgi, 0136-WebUI-Add-Tailscale-VPN)
const (
	TailscaleEnabled = "tailscaleEnabled"
	tailscaleScript  = "/etc/init.d/S46tailscaled"
)

// TailscaleScript is the init script; empty where there is none
var TailscaleScript = tailscaleScript

// TailscaleAvailable reports whether the firmware has Tailscale
func TailscaleAvailable() bool {
	if TailscaleScript == "" {
		return false
	}
	_, err := os.Stat(TailscaleScript)
	return err == nil
}

// SetTailscale switches the VPN as write_config does: the flag file and
// the service
func (s *Service) SetTailscale(on bool) error {
	if s.Flag(TailscaleEnabled) == on {
		return nil
	}
	if on {
		if err := s.SetFlag(TailscaleEnabled, true); err != nil {
			return err
		}
		if TailscaleAvailable() {
			return exec.Command(TailscaleScript, "restart").Run()
		}
		return nil
	}
	if TailscaleAvailable() {
		_ = exec.Command(TailscaleScript, "stop").Run()
	}
	return s.SetFlag(TailscaleEnabled, false)
}
