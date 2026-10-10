//go:build !lite

package websocket

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/backup"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
)

// RestorePath is where a backup to restore is uploaded, next to the
// WebSocket
const RestorePath = "/ws/mui/restore/"

type restoreResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	Success   bool   `json:"success"`
	// prepareRestore: where to upload the backup
	ID  string `json:"id,omitempty"`
	URL string `json:"url,omitempty"`
	// checkRestore: the backup needs the system security key
	NeedsKey bool `json:"needsKey"`
	// checkCcuFirmware: the update's licence text, if it has one
	Eula string `json:"eula,omitempty"`
	// installAddon: the CCU reboots to finish the installation
	Reboot bool `json:"reboot,omitempty"`
}

func (s *Server) serveRestoreUpload(w http.ResponseWriter, r *http.Request) {
	s.backup.ServeUpload(w, r)
}

// handleRestore restores a backup, or installs a firmware file
// (prepareCcuFirmware, checkCcuFirmware or downloadCcuFirmware, installCcuFirmware,
// cancelCcuFirmware) or an add-on (prepareAddonUpload, installAddon), with
// the WebUI's own steps
// (cp_security.cgi): the browser uploads the .sbk once (prepareRestore),
// the WebUI checks it (checkRestore: needs a security key?) and applies it,
// then the CCU reboots (restoreBackup). It replaces every setting of the
// CCU: an elevated administrator, the password once more, audit log.
func (s *Server) handleRestore(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		ID        string `json:"id"`
		Password  string `json:"password"`
		Key       string `json:"key"`
		Language  string `json:"language"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if s.backup == nil {
		s.sendRequestError(client, msg.RequestID, msgType+" is not available", "NOT_AVAILABLE")
		return
	}
	entry := audit.Entry{User: client.user, Action: msgType, Target: "CCU"}
	finish := func(result string) { s.recordAudit(entry, result) }
	if code, errorMsg := configureError(client); code != "" {
		finish(code)
		s.sendRequestError(client, msg.RequestID, errorMsg, code)
		return
	}
	response := restoreResponse{Type: msgType + "_response", RequestID: msg.RequestID, Success: true}

	if msgType == "prepareRestore" || msgType == "prepareCcuFirmware" || msgType == "prepareAddonUpload" || msgType == "prepareDeviceFirmwareUpload" {
		var id string
		var err error
		if msgType == "prepareCcuFirmware" && onCCU() {
			id, err = s.backup.PrepareFirmwareUpload(s.cfg.FirmwareUploadDir)
		} else {
			id, err = s.backup.PrepareUpload()
		}
		if err != nil {
			finish("CCU_ERROR")
			s.sendRequestError(client, msg.RequestID, err.Error(), "CCU_ERROR")
			return
		}
		finish(rega.SetOK)
		response.ID, response.URL = id, RestorePath+id
		s.sendJSON(client, response)
		return
	}

	// Without authentication the WebUI's administrator
	username := client.user
	if s.auth == nil {
		username = "Admin"
	} else if err := s.auth.CheckLockout(username, client.source); err != nil {
		finish("TOO_MANY_ATTEMPTS")
		s.sendRequestError(client, msg.RequestID, err.Error(), "TOO_MANY_ATTEMPTS")
		return
	}
	var err error
	switch msgType {
	case "checkRestore":
		response.NeedsKey, err = s.backup.CheckRestore(msg.ID, username, msg.Password)
	case "restoreBackup":
		disarm := armRestoreReboot()
		err = s.backup.Restore(msg.ID, username, msg.Password, msg.Key)
		if err != nil {
			disarm()
		}
	case "checkCcuFirmware":
		response.Eula, err = s.backup.CheckFirmware(msg.ID, username, msg.Password, msg.Language)
	case "downloadCcuFirmware":
		var verify func() error
		if verify, err = s.firmwareDownloadCheck(); err == nil {
			response.Eula, err = s.backup.DownloadFirmware(username, msg.Password, msg.Language, verify)
			if err != nil {
				// Up to the image's size on the CCU's partition until a reboot
				s.removeUnstagedDownload()
			}
		}
	case "installCcuFirmware":
		if onCCU() && !s.firmwareStaged() {
			err = errFirmwareNotStaged
		} else {
			err = s.backup.InstallFirmware(username, msg.Password)
		}
	case "cancelCcuFirmware":
		err = s.backup.CancelFirmware(username, msg.Password)
	case "installAddon":
		response.Reboot, err = s.backup.InstallAddon(msg.ID, username, msg.Password)
	}
	if err != nil {
		code := "CCU_ERROR"
		switch {
		case errors.Is(err, backup.ErrInvalidCredentials):
			code = "INVALID_CREDENTIALS"
			if s.auth != nil {
				s.auth.RecordFailure(username, client.source)
			}
		case errors.Is(err, backup.ErrInvalidBackup):
			code = "INVALID_BACKUP"
		case errors.Is(err, backup.ErrInvalidFirmware):
			code = "INVALID_FIRMWARE"
		case errors.Is(err, backup.ErrAddonFailed):
			code = "ADDON_FAILED"
		case errors.Is(err, backup.ErrWrongKey):
			code = "WRONG_KEY"
		case errors.Is(err, backup.ErrFirmwareTooOld):
			code = "FIRMWARE_TOO_OLD"
		case errors.Is(err, backup.ErrUploadNotFound):
			code = rega.SetNotFound
		case errors.Is(err, errDirectDownloadUnsupported):
			code = "NOT_SUPPORTED"
		case errors.Is(err, errFirmwareNotStaged):
			code = "FIRMWARE_NOT_STAGED"
		case errors.Is(err, errFirmwareChecksum):
			code = "FIRMWARE_CHECKSUM"
		case errors.Is(err, backup.ErrFirmwareDownloadFailed):
			code = "DOWNLOAD_FAILED"
		}
		finish(code)
		s.sendRequestError(client, msg.RequestID, msgType+" failed: "+err.Error(), code)
		return
	}
	switch msgType {
	case "restoreBackup":
		logger.Info(fmt.Sprintf("💾 Backup restored by %q, the CCU reboots", username))
	case "installCcuFirmware":
		logger.Info(fmt.Sprintf("⬆️ Firmware update started by %q, the CCU reboots", username))
	case "installAddon":
		logger.Info(fmt.Sprintf("📦 Add-on installed by %q (reboot: %t)", username, response.Reboot))
	}
	finish(rega.SetOK)
	s.sendJSON(client, response)
}
