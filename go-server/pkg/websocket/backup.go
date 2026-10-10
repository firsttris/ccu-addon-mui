//go:build !lite

package websocket

import (
	"encoding/json"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/backup"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
)

// SetBackup enables creating backups; they are downloaded from
// BackupPath/<id>.
func (s *Server) SetBackup(service *backup.Service) {
	s.backup = service
}

// BackupPath is where created backups are downloaded, next to the
// WebSocket (the CCU's lighttpd forwards /ws/mui to the server).
const BackupPath = "/ws/mui/backup/"

type backupResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	Success   bool   `json:"success"`
	URL       string `json:"url"`
	FileName  string `json:"fileName"`
	Size      int64  `json:"size"`
}

// handleCreateBackup lets the WebUI create a backup and returns where to
// download it, once and within a few minutes. A backup holds every
// setting and password of the CCU: it takes an elevated administrator and
// the password once more, which the WebUI needs for its session anyway.
func (s *Server) handleCreateBackup(client *Client, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		Password  string `json:"password"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if s.backup == nil {
		s.sendRequestError(client, msg.RequestID, "createBackup is not available", "NOT_AVAILABLE")
		return
	}
	entry := audit.Entry{User: client.user, Action: "createBackup", Target: "CCU"}
	finish := func(result string) { s.recordAudit(entry, result) }
	if code, errorMsg := configureError(client); code != "" {
		finish(code)
		s.sendRequestError(client, msg.RequestID, errorMsg, code)
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

	created, err := s.backup.Create(username, msg.Password)
	if err != nil {
		code := codeOf(err)
		if code == "INVALID_CREDENTIALS" && s.auth != nil {
			s.auth.RecordFailure(username, client.source)
		}
		logger.Infof("💾 Backup failed for user %q: %v", username, err)
		finish(code)
		s.sendRequestError(client, msg.RequestID, "createBackup failed: "+err.Error(), code)
		return
	}
	logger.Infof("💾 Backup %s created (%d bytes)", created.FileName, created.Size)
	finish(rega.SetOK)
	s.sendJSON(client, backupResponse{
		Type: "createBackup_response", RequestID: msg.RequestID, Success: true,
		URL: BackupPath + created.ID, FileName: created.FileName, Size: created.Size,
	})
}
