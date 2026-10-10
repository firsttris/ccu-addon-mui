//go:build !lite

package websocket

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/backup"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/settings"
)

type securitySettings struct {
	SSH           bool `json:"ssh"`
	Auth          bool `json:"auth"`
	HTTPSRedirect bool `json:"httpsRedirect"`
}

type securityResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	securitySettings
	// Seconds until an idle WebUI session ends (rega.conf)
	SessionTimeout int `json:"sessionTimeout"`
	// The level of the security wizard: LOW, MEDIUM, HIGH or CUSTOM
	SecurityLevel string `json:"securityLevel"`
	// Whether the SNMP agent is set up (ccu/getsnmpenabled.tcl)
	SNMP bool `json:"snmp"`
}

// An SNMP user name: one word, as setSNMPUser.sh passes it to snmpd
var snmpUserRegex = regexp.MustCompile(`^[A-Za-z0-9._-]{1,32}$`)

// execSafe says whether Tcl's exec passes the value on as it is. The WebUI's
// setsshpassword.tcl ("exec echo $passwd | mkpasswd") and setsnmpenabled.tcl
// ("exec -- setSNMPUser.sh $user $pass") hand passwords to exec, which takes
// a word starting with <, > or | (also 2>) as a redirection or pipe, and a
// last "&" as running in the background: a password like ">x" would set an
// empty SSH password. The WebUI doesn't check this.
func execSafe(value string) bool {
	return value != "&" && !strings.HasPrefix(value, "2>") && !strings.ContainsAny(value[:min(len(value), 1)], "<>|")
}

// After a change of authentication or HTTPS redirect lighttpd restarts,
// which ends the connections through it: after the answer
var restartLighttpdDelay = time.Second

// handleSecurity shows and changes the WebUI's security settings
// (cp_security.cgi): SSH with its password, authentication of the remote
// API, the redirect to HTTPS, and the system security key. The states are
// read from the flag files, changes go through the WebUI's JSON-RPC
// methods like cp_security.cgi's saveSSHConfig, setUserAuth and
// setHttpsRedirect; for administrators, elevated, with audit log. The
// WebUI session is kept as for the heating groups (PASSWORD_REQUIRED).
func (s *Server) handleSecurity(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		securitySettings
		SSHPassword string `json:"sshPassword"`
		Key         string `json:"key"`
		Password    string `json:"password"`
		// setSessionTimeout
		Seconds int `json:"seconds"`
		// setSecurityLevel
		Level string `json:"level"`
		// setSnmp
		SNMP         bool   `json:"snmp"`
		SNMPUser     string `json:"snmpUser"`
		SNMPPassword string `json:"snmpPassword"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if client.level != auth.LevelAdmin {
		s.sendRequestError(client, msg.RequestID, "only administrators may see the security settings", "FORBIDDEN")
		return
	}
	if s.settings == nil || s.backup == nil {
		s.sendRequestError(client, msg.RequestID, "security settings are not available", "NOT_SUPPORTED")
		return
	}
	current := securitySettings{
		SSH:           s.settings.Flag(settings.SSHEnabled),
		Auth:          s.settings.Flag(settings.AuthEnabled),
		HTTPSRedirect: s.settings.Flag(settings.HTTPSRedirectEnabled),
	}
	switch msgType {
	case "getSecurity":
		timeout, err := s.settings.SessionTimeout()
		if err != nil {
			s.sendRequestError(client, msg.RequestID, "session timeout: "+err.Error(), "CCU_ERROR")
			return
		}
		level, err := s.settings.SecurityLevel()
		if err != nil {
			s.sendRequestError(client, msg.RequestID, "security level: "+err.Error(), "CCU_ERROR")
			return
		}
		s.sendJSON(client, securityResponse{Type: "getSecurity_response", RequestID: msg.RequestID, securitySettings: current, SessionTimeout: timeout, SecurityLevel: level,
			SNMP: s.settings.Flag(settings.SNMPEnabled)})
	case "setSnmp":
		// cp_security.cgi's onSNMPSaveBtn: a user and a password of at least
		// 8 characters to switch on; CCU.setSNMPEnabled runs setSNMPUser.sh
		// or unsetSNMPUser.sh and opens or closes SNMP in the firewall. The
		// password is never written to the audit log.
		entry := audit.Entry{User: client.user, Action: "setSnmp", Target: "SNMP",
			Value: map[string]any{"enabled": msg.SNMP, "user": msg.SNMPUser}, Previous: s.settings.Flag(settings.SNMPEnabled)}
		if code, errorMsg := configureError(client); code != "" {
			s.recordAudit(entry, code)
			s.sendRequestError(client, msg.RequestID, errorMsg, code)
			return
		}
		if msg.SNMP {
			// setSNMPUser.sh writes the password in quotes into snmpd.conf
			if !snmpUserRegex.MatchString(msg.SNMPUser) || len(msg.SNMPPassword) < 8 || strings.ContainsAny(msg.SNMPPassword, "\"\\\r\n") || !execSafe(msg.SNMPPassword) {
				s.recordAudit(entry, "INVALID_VALUE")
				s.sendRequestError(client, msg.RequestID, "a user and a password of at least 8 characters are needed", "INVALID_VALUE")
				return
			}
		} else {
			msg.SNMPUser, msg.SNMPPassword = "", ""
		}
		result, err := s.backup.AdminCall(client.user, msg.Password, "CCU.setSNMPEnabled",
			map[string]any{"enabled": msg.SNMP, "usr": msg.SNMPUser, "pass": msg.SNMPPassword})
		if answer, ok := result.(map[string]any); err == nil && (!ok || answer["msg"] != "noError") {
			err = fmt.Errorf("SNMP was not set up: %v", result)
		}
		if err != nil {
			s.failChange(client, msg.RequestID, entry, err)
			return
		}
		s.recordAudit(entry, rega.SetOK)
		s.sendJSON(client, changeResponse{Type: "setSnmp_response", RequestID: msg.RequestID, Success: true})
	case "setSecurityLevel":
		// The security wizard (DialogChooseSecuritySettings): firewall and
		// authentication together through CCU.setSecurityLevel, then
		// lighttpd restarts as in the WebUI, after the answer
		previous, _ := s.settings.SecurityLevel()
		entry := audit.Entry{User: client.user, Action: "setSecurityLevel", Target: "security level", Value: msg.Level, Previous: previous}
		if code, errorMsg := configureError(client); code != "" {
			s.recordAudit(entry, code)
			s.sendRequestError(client, msg.RequestID, errorMsg, code)
			return
		}
		if !settings.ValidSecurityLevel(msg.Level) {
			s.recordAudit(entry, "INVALID_VALUE")
			s.sendRequestError(client, msg.RequestID, "unknown security level "+msg.Level, "INVALID_VALUE")
			return
		}
		result, err := s.backup.AdminCall(client.user, msg.Password, "CCU.setSecurityLevel", map[string]any{"level": msg.Level})
		if err == nil && result != true {
			err = errors.New("the CCU did not set the security level")
		}
		if err != nil {
			s.failChange(client, msg.RequestID, entry, err)
			return
		}
		s.recordAudit(entry, rega.SetOK)
		s.sendJSON(client, changeResponse{Type: "setSecurityLevel_response", RequestID: msg.RequestID, Success: true})
		user := client.user
		go func() {
			time.Sleep(restartLighttpdDelay)
			if _, err := s.backup.AdminCall(user, "", "User.restartLighttpd", nil); err != nil {
				logger.Error("Failed to restart lighttpd:", err)
			}
		}()
	case "setSessionTimeout":
		// Written as cp_security.cgi action_set_session_timeout does; ReGa
		// takes it on the next start
		previous, _ := s.settings.SessionTimeout()
		entry := audit.Entry{User: client.user, Action: "setSessionTimeout", Target: "rega.conf", Value: msg.Seconds, Previous: previous}
		if code, errorMsg := configureError(client); code != "" {
			s.recordAudit(entry, code)
			s.sendRequestError(client, msg.RequestID, errorMsg, code)
			return
		}
		if err := s.settings.SetSessionTimeout(msg.Seconds); err != nil {
			code := codeOf(err)
			s.recordAudit(entry, code)
			s.sendRequestError(client, msg.RequestID, err.Error(), code)
			return
		}
		s.recordAudit(entry, rega.SetOK)
		s.sendJSON(client, changeResponse{Type: "setSessionTimeout_response", RequestID: msg.RequestID, Success: true})
	case "setSecurity":
		next := msg.securitySettings
		// The SSH password is never written to the audit log
		entry := audit.Entry{User: client.user, Action: "setSecurity", Target: "security", Value: map[string]any{
			"ssh": next.SSH, "auth": next.Auth, "httpsRedirect": next.HTTPSRedirect, "sshPasswordChanged": msg.SSHPassword != "",
		}, Previous: current}
		if code, errorMsg := configureError(client); code != "" {
			s.recordAudit(entry, code)
			s.sendRequestError(client, msg.RequestID, errorMsg, code)
			return
		}
		if strings.ContainsAny(msg.SSHPassword, "\r\n") || !execSafe(msg.SSHPassword) {
			s.recordAudit(entry, "INVALID_VALUE")
			s.sendRequestError(client, msg.RequestID, "invalid SSH password", "INVALID_VALUE")
			return
		}
		call := func(method string, params map[string]any) (any, error) {
			result, err := s.backup.AdminCall(client.user, msg.Password, method, params)
			// The new session is kept: the next calls need no password
			msg.Password = ""
			return result, err
		}
		err := func() error {
			if msg.SSHPassword != "" {
				result, err := call("CCU.setSSHPassword", map[string]any{"passwd": msg.SSHPassword})
				if err != nil {
					return err
				}
				if answer, ok := result.(map[string]any); !ok || answer["msg"] != "noError" {
					return fmt.Errorf("the SSH password was not set: %v", result)
				}
			}
			if next.SSH != current.SSH || msg.SSHPassword != "" {
				if _, err := call("CCU.setSSH", map[string]any{"mode": next.SSH}); err != nil {
					return err
				}
				if _, err := call("CCU.restartSSHDaemon", nil); err != nil {
					return err
				}
			}
			if next.Auth != current.Auth {
				if _, err := call("CCU.setAuthEnabled", map[string]any{"enabled": next.Auth}); err != nil {
					return err
				}
			}
			if next.HTTPSRedirect != current.HTTPSRedirect {
				if _, err := call("CCU.setHttpsRedirectEnabled", map[string]any{"enabled": next.HTTPSRedirect}); err != nil {
					return err
				}
			}
			return nil
		}()
		if err != nil {
			s.failChange(client, msg.RequestID, entry, err)
			return
		}
		s.recordAudit(entry, rega.SetOK)
		s.sendJSON(client, changeResponse{Type: "setSecurity_response", RequestID: msg.RequestID, Success: true})
		if next.Auth != current.Auth || next.HTTPSRedirect != current.HTTPSRedirect {
			user := client.user
			go func() {
				time.Sleep(restartLighttpdDelay)
				if _, err := s.backup.AdminCall(user, "", "User.restartLighttpd", nil); err != nil {
					logger.Error("Failed to restart lighttpd:", err)
				}
			}()
		}
	case "factoryReset":
		// cp_security.cgi's system reset: everything on the CCU is deleted,
		// this add-on too. The key is checked before the answer; the reset
		// itself stops the add-ons, so it runs after it.
		entry := audit.Entry{User: client.user, Action: "factoryReset", Target: "CCU"}
		if code, errorMsg := configureError(client); code != "" {
			s.recordAudit(entry, code)
			s.sendRequestError(client, msg.RequestID, errorMsg, code)
			return
		}
		// Irreversible: the password every time, not only a recent one
		// (elevation) or a kept WebUI session
		if msg.Password == "" {
			s.recordAudit(entry, "PASSWORD_REQUIRED")
			s.sendRequestError(client, msg.RequestID, "enter the password to reset the CCU", "PASSWORD_REQUIRED")
			return
		}
		if err := s.backup.CheckFactoryReset(client.user, msg.Password, msg.Key); err != nil {
			code := ""
			switch {
			case errors.Is(err, backup.ErrResetKeyRequired):
				code = "KEY_REQUIRED"
			case errors.Is(err, backup.ErrResetKeyWrong):
				code = "KEY_WRONG"
			}
			if code != "" {
				s.recordAudit(entry, code)
				s.sendRequestError(client, msg.RequestID, err.Error(), code)
				return
			}
			s.failChange(client, msg.RequestID, entry, err)
			return
		}
		s.recordAudit(entry, rega.SetOK)
		s.sendJSON(client, changeResponse{Type: "factoryReset_response", RequestID: msg.RequestID, Success: true})
		user, key := client.user, msg.Key
		go func() {
			time.Sleep(restartLighttpdDelay)
			s.backup.FactoryReset(user, key)
		}()
	case "changeSecurityKey":
		// The key is never written to the audit log
		entry := audit.Entry{User: client.user, Action: "changeSecurityKey", Target: "system security key"}
		if code, errorMsg := configureError(client); code != "" {
			s.recordAudit(entry, code)
			s.sendRequestError(client, msg.RequestID, errorMsg, code)
			return
		}
		if err := s.backup.ChangeSecurityKey(client.user, msg.Password, msg.Key); err != nil {
			s.failChange(client, msg.RequestID, entry, err)
			return
		}
		s.recordAudit(entry, rega.SetOK)
		s.sendJSON(client, changeResponse{Type: "changeSecurityKey_response", RequestID: msg.RequestID, Success: true})
	}
}
