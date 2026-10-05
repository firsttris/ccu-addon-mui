package backup

import (
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// Updating the CCU's firmware goes through the WebUI's own steps
// (cp_maintenance.cgi): fileupload.ccc stores the file, action
// firmware_upload checks it and links it as /usr/local/.firmwareUpdate
// (going on to askCreateBackup, or firmware_update_invalid), the WebUI
// shows the update's EULA (/EULA.<lang>), and update_start saves ReGa and
// reboots into the recovery system, which installs it.

// ErrInvalidFirmware: the file is no firmware update for this CCU
var ErrInvalidFirmware = errors.New("invalid firmware file")

// ErrFirmwareDownloadFailed: the CCU could not download the update
// (CCU.downloadFirmware answered false)
var ErrFirmwareDownloadFailed = errors.New("the CCU could not download the firmware")

// Downloading a full OpenCCU image over a slow line takes a while
const firmwareDownloadTimeout = 30 * time.Minute

const maintenancePage = "/config/cp_maintenance.cgi"

// CheckFirmware lets the WebUI check an uploaded firmware file. Returns
// the update's licence text in lang (de, en), if it has one. A file that
// was stored on the CCU itself (PrepareFirmwareUpload) is checked in
// place, otherwise it goes through fileupload.ccc first.
func (s *Service) CheckFirmware(id, username, password, lang string) (string, error) {
	s.removeExpiredUploads()
	path, err := s.uploadPath(id)
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	inPlace := s.uploads[id].limit == maxFirmwareSize
	s.mu.Unlock()
	sessionID, err := s.login(username, password)
	if err != nil {
		return "", err
	}
	defer s.logout(sessionID)
	filename := path
	if !inPlace {
		if filename, err = s.fileUpload(sessionID, path, "firmware_file", "firmware_upload", maintenancePage); err != nil {
			return "", err
		}
		// The CCU has its copy now
		s.Discard(id)
	}
	page, err := s.pageAction(sessionID, maintenancePage, url.Values{"action": {"firmware_upload"}, "filename": {filename}, "downloadOnly": {"0"}})
	if err != nil {
		// Not checked: the file would stay on the CCU until it reboots
		os.Remove(filename)
		s.forget(id)
		return "", err
	}
	// Linked for the update (or deleted by the WebUI when invalid)
	s.forget(id)
	if err := firmwarePageResult(page); err != nil {
		return "", err
	}
	if lang != "en" {
		lang = "de"
	}
	return s.eula(lang), nil
}

// firmwarePageResult reads action_firmware_upload's answer: on to
// askCreateBackup, or firmware_update_invalid; anything else (a login page
// after the session expired) is no verdict on the file
func firmwarePageResult(page string) error {
	switch {
	case strings.Contains(page, "action=askCreateBackup"):
		return nil
	case strings.Contains(page, "action=firmware_update_invalid"):
		return ErrInvalidFirmware
	default:
		return errors.New("unexpected answer from the WebUI's firmware check")
	}
}

// DownloadFirmware lets the CCU download the newest firmware itself and
// checks it, as the WebUI's direct download does (cp_maintenance.cgi
// performDirectDownload): CCU.downloadFirmware stores it (OpenCCU:
// /usr/local/tmp/firmwareUpdateFile from GitHub; a CCU3: /tmp/fup.tgz from
// eQ-3), verify may check it, then action firmware_upload with
// directDownload links it for the update. Returns the update's licence
// text like CheckFirmware.
func (s *Service) DownloadFirmware(username, password, lang string, verify func() error) (string, error) {
	sessionID, err := s.login(username, password)
	if err != nil {
		return "", err
	}
	defer func() { s.logout(sessionID) }()
	var result rpcResponse
	client := &http.Client{Timeout: firmwareDownloadTimeout}
	if err := s.callWith(client, "CCU.downloadFirmware", map[string]string{"_session_id_": sessionID}, &result); err != nil {
		return "", err
	}
	if ok, _ := result.Result.(bool); !ok || result.Error != nil {
		return "", ErrFirmwareDownloadFailed
	}
	if verify != nil {
		if err := verify(); err != nil {
			return "", err
		}
	}
	// The download may outlast the WebUI session: a fresh one for the check
	s.logout(sessionID)
	if sessionID, err = s.login(username, password); err != nil {
		return "", err
	}
	page, err := s.pageAction(sessionID, maintenancePage, url.Values{"action": {"firmware_upload"}, "directDownload": {"true"}, "downloadOnly": {"0"}})
	if err != nil {
		return "", err
	}
	if err := firmwarePageResult(page); err != nil {
		return "", err
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
