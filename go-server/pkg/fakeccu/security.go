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
