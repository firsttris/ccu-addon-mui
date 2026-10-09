package websocket

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/rega"
)

// The language of each CCU user, as the WebUI keeps it
// (api/methods/user/getlanguage.tcl, setlanguage.tcl, chosen in
// userAccountConfigAdmin.htm): /etc/config/userprofiles/<user>.lang with
// 0 (automatic, the browser's), 1 (German) or 2 (English). The same choice
// then applies in the add-on and in the old WebUI. The directory is in the
// configured CCU config directory; userProfilesDir without one. On
// openccu-lite, without a WebUI to share them with, they are the add-on's
// own data in DATA_DIR: /etc/config is not the add-on's to write there.
var userProfilesDir = "/etc/config/userprofiles"

func (s *Server) profilesDir() string {
	if s.platform == PlatformLite && s.cfg != nil && s.cfg.DataDir != "" {
		return filepath.Join(s.cfg.DataDir, "userprofiles")
	}
	if s.cfg != nil && s.cfg.ConfigDir != "" {
		return filepath.Join(s.cfg.ConfigDir, "userprofiles")
	}
	return userProfilesDir
}

type userLanguageResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	Language  int    `json:"language"`
}

// languageFile is the user's .lang file; "" for a name that would leave
// the directory (setlanguage.tcl strips "../")
func languageFile(dir, user string) string {
	if user == "" || strings.ContainsAny(user, "/\\\x00") || strings.HasPrefix(user, ".") {
		return ""
	}
	return filepath.Join(dir, user+".lang")
}

// readUserLanguage reads the choice; anything unknown is automatic, as the
// WebUI does (lang > 2 → 0)
func readUserLanguage(file string) int {
	if file == "" {
		return 0
	}
	data, err := os.ReadFile(file)
	if err != nil {
		return 0
	}
	language, err := strconv.Atoi(strings.TrimSpace(strings.SplitN(string(data), "\n", 2)[0]))
	if err != nil || language < 0 || language > 2 {
		return 0
	}
	return language
}

// handleUserLanguage reads or sets the logged-in user's own language; like
// User.setLanguage (LEVEL USER) not for guests
func (s *Server) handleUserLanguage(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		Language  *int   `json:"language"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	dir := s.profilesDir()
	file := languageFile(dir, client.user)
	if file == "" {
		s.sendRequestError(client, msg.RequestID, "the language is kept per CCU user", "NOT_SUPPORTED")
		return
	}
	if msgType == "getUserLanguage" {
		s.sendJSON(client, userLanguageResponse{Type: "getUserLanguage_response", RequestID: msg.RequestID, Language: readUserLanguage(file)})
		return
	}
	entry := audit.Entry{User: client.user, Action: "setUserLanguage", Target: client.user, Previous: readUserLanguage(file)}
	if msg.Language != nil {
		entry.Value = *msg.Language
	}
	if !canOperate(client.level) {
		s.recordAudit(entry, "FORBIDDEN")
		s.sendRequestError(client, msg.RequestID, "guests may not change their language", "FORBIDDEN")
		return
	}
	if msg.Language == nil || *msg.Language < 0 || *msg.Language > 2 {
		s.recordAudit(entry, "INVALID_VALUE")
		s.sendRequestError(client, msg.RequestID, "language must be 0, 1 or 2", "INVALID_VALUE")
		return
	}
	err := os.MkdirAll(dir, 0o755)
	if err == nil {
		// setlanguage.tcl: echo $userLang > /etc/config/userprofiles/$userName.lang
		err = os.WriteFile(file, []byte(strconv.Itoa(*msg.Language)+"\n"), 0o644)
	}
	if err != nil {
		s.recordAudit(entry, "CCU_ERROR")
		s.sendRequestError(client, msg.RequestID, "setUserLanguage failed: "+err.Error(), "CCU_ERROR")
		return
	}
	s.recordAudit(entry, rega.SetOK)
	s.sendJSON(client, changeResponse{Type: "setUserLanguage_response", RequestID: msg.RequestID, Success: true})
}
