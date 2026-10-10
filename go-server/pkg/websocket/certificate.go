//go:build !lite

package websocket

import (
	"encoding/json"
	"time"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/settings"
)

type certificateResponse struct {
	Type        string                   `json:"type"`
	RequestID   string                   `json:"requestId,omitempty"`
	Certificate settings.CertificateInfo `json:"certificate"`
}

// handleCertificate shows, replaces and deletes the HTTPS certificate of
// the WebUI, as cp_network.cgi (action_cert_upload, User.deleteCertificate)
// does: /etc/config/server.pem with certificate and key, then lighttpd is
// restarted (User.restartLighttpd), after the answer. For administrators,
// elevated, with audit log and the kept WebUI session; the session is
// checked before the file changes, so the restart can't fail for it.
func (s *Server) handleCertificate(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		PEM       string `json:"pem"`
		Password  string `json:"password"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if client.level != auth.LevelAdmin {
		s.sendRequestError(client, msg.RequestID, "only administrators may see the certificate", "FORBIDDEN")
		return
	}
	if s.settings == nil || s.backup == nil {
		s.sendRequestError(client, msg.RequestID, "the certificate is not available", "NOT_SUPPORTED")
		return
	}
	if msgType == "getCertificate" {
		info, err := s.settings.Certificate()
		if err != nil {
			s.sendRequestError(client, msg.RequestID, "certificate: "+err.Error(), "CCU_ERROR")
			return
		}
		s.sendJSON(client, certificateResponse{Type: "getCertificate_response", RequestID: msg.RequestID, Certificate: info})
		return
	}
	// The key never goes into the audit log
	entry := audit.Entry{User: client.user, Action: msgType, Target: "server.pem"}
	if code, errorMsg := configureError(client); code != "" {
		s.recordAudit(entry, code)
		s.sendRequestError(client, msg.RequestID, errorMsg, code)
		return
	}
	if msgType == "uploadCertificate" {
		if err := settings.ValidateCertificate(msg.PEM); err != nil {
			s.recordAudit(entry, "INVALID_VALUE")
			s.sendRequestError(client, msg.RequestID, err.Error(), "INVALID_VALUE")
			return
		}
	}
	if _, err := s.backup.AdminCall(client.user, msg.Password, "User.existsCertificate", nil); err != nil {
		s.failChange(client, msg.RequestID, entry, err)
		return
	}
	var err error
	if msgType == "uploadCertificate" {
		err = s.settings.SetCertificate(msg.PEM)
	} else {
		err = s.settings.DeleteCertificate()
	}
	if err != nil {
		s.failChange(client, msg.RequestID, entry, err)
		return
	}
	s.recordAudit(entry, rega.SetOK)
	s.sendJSON(client, changeResponse{Type: msgType + "_response", RequestID: msg.RequestID, Success: true})
	user := client.user
	go func() {
		time.Sleep(restartLighttpdDelay)
		if _, err := s.backup.AdminCall(user, "", "User.restartLighttpd", nil); err != nil {
			logger.Error("Failed to restart lighttpd:", err)
		}
	}()
}
