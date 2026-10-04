package backup

import (
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// Updating the CCU's firmware goes through the WebUI's own steps
// (cp_maintenance.cgi): fileupload.ccc stores the file, action
// firmware_upload checks it and links it as /usr/local/.firmwareUpdate
// (going on to askCreateBackup, or firmware_update_invalid), the WebUI
// shows the update's EULA (/EULA.<lang>), and update_start saves ReGa and
// reboots into the recovery system, which installs it.

// ErrInvalidFirmware: the file is no firmware update for this CCU
var ErrInvalidFirmware = errors.New("invalid firmware file")

const maintenancePage = "/config/cp_maintenance.cgi"

// CheckFirmware uploads a firmware file to the CCU and lets the WebUI check
// it. Returns the update's licence text in lang (de, en), if it has one.
func (s *Service) CheckFirmware(id, username, password, lang string) (string, error) {
	s.removeExpiredUploads()
	path, err := s.uploadPath(id)
	if err != nil {
		return "", err
	}
	sessionID, err := s.login(username, password)
	if err != nil {
		return "", err
	}
	defer s.logout(sessionID)
	filename, err := s.fileUpload(sessionID, path, "firmware_file", "firmware_upload", maintenancePage)
	if err != nil {
		return "", err
	}
	// The CCU has the file now
	s.Discard(id)
	page, err := s.pageAction(sessionID, maintenancePage, url.Values{"action": {"firmware_upload"}, "filename": {filename}, "downloadOnly": {"0"}})
	if err != nil {
		return "", err
	}
	if !strings.Contains(page, "action=askCreateBackup") {
		return "", ErrInvalidFirmware
	}
	if lang != "en" {
		lang = "de"
	}
	return s.eula(lang), nil
}

// eula reads the licence text the WebUI shows before the update
// (action_acceptEula: /EULA.<lang>); "" without one
func (s *Service) eula(lang string) string {
	resp, err := s.httpClient.Get(s.webUIURL + "/EULA." + lang)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return ""
	}
	text, _ := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	return string(text)
}

// InstallFirmware starts the update of the checked file, as
// firmware_update_go does with action update_start; the CCU reboots
func (s *Service) InstallFirmware(username, password string) error {
	return s.maintenanceAction(username, password, "update_start")
}

// CancelFirmware removes the checked file (firmware_update_cancel)
func (s *Service) CancelFirmware(username, password string) error {
	return s.maintenanceAction(username, password, "firmware_update_cancel")
}

func (s *Service) maintenanceAction(username, password, action string) error {
	sessionID, err := s.login(username, password)
	if err != nil {
		return err
	}
	defer s.logout(sessionID)
	_, err = s.pageAction(sessionID, maintenancePage, url.Values{"action": {action}})
	return err
}
