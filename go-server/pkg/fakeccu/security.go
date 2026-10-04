package fakeccu

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
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
