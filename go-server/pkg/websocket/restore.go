//go:build !lite

package websocket

import (
	"net/http"

	"ccu-addon-mui-server/pkg/audit"
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
	var msg restoreRequest
	if !s.decode(client, message, &msg) {
		return
	}
	if s.backup == nil {
		s.sendRequestError(client, msg.RequestID, msgType+" is not available", "NOT_AVAILABLE")
		return
	}
	entry := audit.Entry{User: client.user, Action: msgType, Target: "CCU"}
	if !s.mayConfigure(client, msg.RequestID, entry) {
		return
	}
	response := restoreResponse{Type: msgType + "_response", RequestID: msg.RequestID, Success: true}
	if uploads[msgType] {
		s.prepareUpload(client, msgType, entry, response)
		return
	}
	step, ok := restoreSteps[msgType]
	if !ok {
		return
	}
	// Without authentication the WebUI's administrator
	username := client.user
	if s.auth == nil {
		username = "Admin"
	} else if err := s.auth.CheckLockout(username, client.source); err != nil {
		s.recordAudit(entry, "TOO_MANY_ATTEMPTS")
		s.sendRequestError(client, msg.RequestID, err.Error(), "TOO_MANY_ATTEMPTS")
		return
	}
	if err := step.run(s, msg, username, &response); err != nil {
		code := codeOf(err,
			errorCode{errDirectDownloadUnsupported, "NOT_SUPPORTED"},
			errorCode{errFirmwareNotStaged, "FIRMWARE_NOT_STAGED"},
			errorCode{errFirmwareChecksum, "FIRMWARE_CHECKSUM"})
		if code == "INVALID_CREDENTIALS" && s.auth != nil {
			s.auth.RecordFailure(username, client.source)
		}
		s.recordAudit(entry, code)
		s.sendRequestError(client, msg.RequestID, msgType+" failed: "+err.Error(), code)
		return
	}
	if step.done != nil {
		step.done(username, response)
	}
	s.recordAudit(entry, rega.SetOK)
	s.sendJSON(client, response)
}

type restoreRequest struct {
	RequestID string `json:"requestId"`
	ID        string `json:"id"`
	Password  string `json:"password"`
	Key       string `json:"key"`
	Language  string `json:"language"`
}

// The uploads a step prepares: the browser sends the file to the URL
// answered
var uploads = map[string]bool{
	"prepareRestore": true, "prepareCcuFirmware": true, "prepareAddonUpload": true, "prepareDeviceFirmwareUpload": true,
}

func (s *Server) prepareUpload(client *Client, msgType string, entry audit.Entry, response restoreResponse) {
	var id string
	var err error
	if msgType == "prepareCcuFirmware" && onCCU() {
		id, err = s.backup.PrepareFirmwareUpload(s.cfg.FirmwareUploadDir)
	} else {
		id, err = s.backup.PrepareUpload()
	}
	if err != nil {
		s.recordAudit(entry, "CCU_ERROR")
		s.sendRequestError(client, response.RequestID, err.Error(), "CCU_ERROR")
		return
	}
	s.recordAudit(entry, rega.SetOK)
	response.ID, response.URL = id, RestorePath+id
	s.sendJSON(client, response)
}

// A step with the administrator's password: run fills the response, done
// logs what happened after it worked
type restoreStep struct {
	run  func(s *Server, msg restoreRequest, username string, response *restoreResponse) error
	done func(username string, response restoreResponse)
}

var restoreSteps = map[string]restoreStep{
	"checkRestore": {run: func(s *Server, msg restoreRequest, username string, response *restoreResponse) (err error) {
		response.NeedsKey, err = s.backup.CheckRestore(msg.ID, username, msg.Password)
		return err
	}},
	"restoreBackup": {
		run: func(s *Server, msg restoreRequest, username string, _ *restoreResponse) error {
			disarm := armRestoreReboot()
			err := s.backup.Restore(msg.ID, username, msg.Password, msg.Key)
			if err != nil {
				disarm()
			}
			return err
		},
		done: func(username string, _ restoreResponse) {
			logger.Infof("💾 Backup restored by %q, the CCU reboots", username)
		},
	},
	"checkCcuFirmware": {run: func(s *Server, msg restoreRequest, username string, response *restoreResponse) (err error) {
		response.Eula, err = s.backup.CheckFirmware(msg.ID, username, msg.Password, msg.Language)
		return err
	}},
	"downloadCcuFirmware": {run: func(s *Server, msg restoreRequest, username string, response *restoreResponse) error {
		verify, err := s.firmwareDownloadCheck()
		if err != nil {
			return err
		}
		response.Eula, err = s.backup.DownloadFirmware(username, msg.Password, msg.Language, verify)
		if err != nil {
			// Up to the image's size on the CCU's partition until a reboot
			s.removeUnstagedDownload()
		}
		return err
	}},
	"installCcuFirmware": {
		run: func(s *Server, msg restoreRequest, username string, _ *restoreResponse) error {
			if onCCU() && !s.firmwareStaged() {
				return errFirmwareNotStaged
			}
			return s.backup.InstallFirmware(username, msg.Password)
		},
		done: func(username string, _ restoreResponse) {
			logger.Infof("⬆️ Firmware update started by %q, the CCU reboots", username)
		},
	},
	"cancelCcuFirmware": {run: func(s *Server, msg restoreRequest, username string, _ *restoreResponse) error {
		return s.backup.CancelFirmware(username, msg.Password)
	}},
	"installAddon": {
		run: func(s *Server, msg restoreRequest, username string, response *restoreResponse) (err error) {
			response.Reboot, err = s.backup.InstallAddon(msg.ID, username, msg.Password)
			return err
		},
		done: func(username string, response restoreResponse) {
			logger.Infof("📦 Add-on installed by %q (reboot: %t)", username, response.Reboot)
		},
	},
}
