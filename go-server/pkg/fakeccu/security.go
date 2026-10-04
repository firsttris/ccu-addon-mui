package fakeccu

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// securityMethod is the WebUI's JSON-RPC methods of cp_security.cgi
// (ccu/setssh.tcl, setsshpassword.tcl, setauthenabled.tcl, ...): flag files
// in ConfigDir
func (c *CCU) securityMethod(method string, params map[string]interface{}) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.calls["JSON "+method]++
	flag := func(name string, on bool) {
		if c.ConfigDir == "" {
			return
		}
		path := filepath.Join(c.ConfigDir, name)
		if on {
			_ = os.WriteFile(path, nil, 0o644)
		} else {
			_ = os.Remove(path)
		}
	}
	isTrue := func(key string) bool { return fmt.Sprint(params[key]) == "true" }
	switch method {
	case "CCU.setSSH":
		flag("sshEnabled", isTrue("mode"))
	case "CCU.setSSHPassword":
		c.SSHPassword = fmt.Sprint(params["passwd"])
		return `{"version":"1.1","result":{"msg":"noError"},"error":null}`
	case "CCU.setAuthEnabled":
		flag("authEnabled", isTrue("enabled"))
	case "CCU.setHttpsRedirectEnabled":
		flag("httpsRedirectEnabled", isTrue("enabled"))
	case "User.existsCertificate":
		_, err := os.Stat(filepath.Join(c.ConfigDir, "server.pem"))
		return fmt.Sprintf(`{"version":"1.1","result":%v,"error":null}`, c.ConfigDir != "" && err == nil)
	}
	return `{"version":"1.1","result":true,"error":null}`
}

// changeKey is cp_security.cgi's action_change_key, answering with the
// WebUI's message keys
func (c *CCU) changeKey(w http.ResponseWriter, key1, key2 string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	message := "dialogSettingsSecurityMessageErrorSecKeyContentSetKeySucceed"
	switch {
	case key1 != key2:
		message = "dialogSettingsSecurityMessageErrorSecKeyContentKeysNotIdentical"
	case len(key1) < 5:
		message = "dialogSettingsSecurityMessageErrorSecKeyContentKeyShort"
	case key1 == c.SecurityKey:
		message = "dialogSettingsSecurityMessageErrorSecKeyContentKeysIsIdentical"
	default:
		c.SecurityKey = key1
	}
	w.Header().Set("Content-Type", "text/html")
	_, _ = io.WriteString(w, "<script>MessageBox.show('${dialogSettingsSecurityMessageOKSecKeyTitle}', '${"+message+"}');</script>")
}

// setFirewall is Firewall.setConfiguration: writes firewall.conf as
// Firewall_saveConfiguration (simplified; the ports as defined)
func (c *CCU) setFirewall(params map[string]interface{}) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.calls["JSON Firewall.setConfiguration"]++
	if c.ConfigDir == "" {
		return `{"version":"1.1","result":true,"error":null}`
	}
	list := func(key string) string {
		var parts []string
		if items, ok := params[key].([]interface{}); ok {
			for _, item := range items {
				parts = append(parts, fmt.Sprint(item))
			}
		}
		return strings.Join(parts, " ")
	}
	access := map[string]string{"XMLRPC": "none", "REGA": "none", "NEOSERVER": "none", "SNMP": "none"}
	ports := map[string]string{
		"XMLRPC": "2000 2001 2002 2010 9292 42000 42001 42010 49292", "REGA": "8181 1999 48181 41999",
		"NEOSERVER": "8088 9099 1901 1902 5987 10000 48899 49880", "SNMP": "161",
	}
	if old, err := os.ReadFile(filepath.Join(c.ConfigDir, "firewall.conf")); err == nil {
		section := ""
		for _, line := range strings.Split(string(old), "\n") {
			if strings.HasPrefix(line, "Id = ") {
				section = strings.TrimPrefix(line, "Id = ")
			}
			if strings.HasPrefix(line, "Access = ") && section != "" {
				access[section] = strings.TrimPrefix(line, "Access = ")
			}
		}
	}
	if services, ok := params["services"].([]interface{}); ok {
		for _, item := range services {
			if s, ok := item.(map[string]interface{}); ok {
				access[fmt.Sprint(s["name"])] = fmt.Sprint(s["access"])
			}
		}
	}
	var b strings.Builder
	fmt.Fprintf(&b, "# Firewall Configuration file\n\nMODE = %s\n\nIPs = %s\n\n", params["mode"], list("ips"))
	if userPorts := list("userports"); userPorts != "" {
		fmt.Fprintf(&b, "USERPORTS = %s\n", userPorts)
	}
	for _, id := range []string{"XMLRPC", "REGA", "NEOSERVER", "SNMP"} {
		fmt.Fprintf(&b, "\n[SERVICE %s]\nId = %s\nPorts = %s\nAccess = %s\n", id, id, ports[id], access[id])
	}
	_ = os.WriteFile(filepath.Join(c.ConfigDir, "firewall.conf"), []byte(b.String()), 0o644)
	return `{"version":"1.1","result":true,"error":null}`
}

// lanGatewayMethod writes the LAN gateways as the WebUI's
// setconfiguration-rf.tcl and setconfiguration-wired.tcl do (the header up
// to the first gateway kept), and a key change as changeLanGatewayKey.tcl
func (c *CCU) lanGatewayMethod(method string, params map[string]interface{}) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.calls["JSON "+method]++
	if c.ConfigDir == "" {
		return `{"version":"1.1","result":true,"error":null}`
	}
	if method == "BidCoS.changeLanGatewayKey" {
		serial := fmt.Sprint(params["lgwserial"])
		content := fmt.Sprintf("Class=%v\nSerial=%s\nIP=%v\nKEY=%v\nCURKEY=%v\n", params["lgwclass"], serial, params["lgwip"], params["newkey"], params["curkey"])
		_ = os.WriteFile(filepath.Join(c.ConfigDir, filepath.Base(serial)+".keychange"), []byte(content), 0o644)
		return `{"version":"1.1","result":true,"error":null}`
	}
	file, first, header := "rfd.conf", 1, "Listen Port = 2001\n\n[Interface 0]\nType = CCU2\nComPortFile = /dev/mmd_bidcos\n\n"
	if method == "BidCoS_Wired.setConfigurationWired" {
		file, first, header = "hs485d.conf", 0, "Listen Port = 32000\n\n"
	}
	path := filepath.Join(c.ConfigDir, file)
	if old, err := os.ReadFile(path); err == nil {
		text := string(old)
		marker := fmt.Sprintf("[Interface %d]", first)
		if i := strings.Index(text, marker); i >= 0 {
			text = text[:i]
		}
		header = text
	}
	var b strings.Builder
	b.WriteString(header)
	if items, ok := params["interfaces"].([]interface{}); ok {
		for i, item := range items {
			g, _ := item.(map[string]interface{})
			fmt.Fprintf(&b, "[Interface %d]\nType = %v\nName = %v\nSerial Number = %v\nEncryption Key = %v\n", first+i, g["type"], g["userName"], g["serialNumber"], g["encryptionKey"])
			if ip := fmt.Sprint(g["ipAddress"]); ip != "" && g["ipAddress"] != nil {
				fmt.Fprintf(&b, "IP Address = %s\n", ip)
			}
			b.WriteString("\n")
		}
	}
	_ = os.WriteFile(path, []byte(b.String()), 0o644)
	return `{"version":"1.1","result":true,"error":null}`
}

// lanGatewayModules are the RF gateways of rfd.conf as radio modules of
// BidCos-RF (the real rfd takes them on its next start)
func (c *CCU) lanGatewayModules(iface string) []map[string]interface{} {
	if iface != "BidCos-RF" || c.ConfigDir == "" {
		return nil
	}
	data, err := os.ReadFile(filepath.Join(c.ConfigDir, "rfd.conf"))
	if err != nil {
		return nil
	}
	modules := []map[string]interface{}{}
	gateway := false
	for _, line := range strings.Split(string(data), "\n") {
		key, value, _ := strings.Cut(line, "=")
		key, value = strings.TrimSpace(key), strings.TrimSpace(value)
		if key == "Type" {
			gateway = value != "CCU2"
		}
		if key == "Serial Number" && gateway {
			modules = append(modules, map[string]interface{}{
				"ADDRESS": value, "DESCRIPTION": "", "CONNECTED": true, "DEFAULT": false, "DUTY_CYCLE": 2,
				"TYPE": "HMLGW2", "FIRMWARE_VERSION": "1.1.5",
			})
		}
	}
	return modules
}
