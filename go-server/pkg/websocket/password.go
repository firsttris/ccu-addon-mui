package websocket

import (
	"encoding/json"
	"strings"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
)

// handleChangePassword lets a logged-in user change their own password, as
// the WebUI lets users edit their own account (system.fn::saveUserPwd: not
// guests). The current password confirms it; the user's other devices are
// logged out.
func (s *Server) handleChangePassword(client *Client, message []byte) {
	var msg struct {
		RequestID       string `json:"requestId"`
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	entry := audit.Entry{User: client.user, Action: "changePassword", Target: client.user}
	finish := func(code, errorMsg string) {
		entry.Result = code
		if err := s.audit.Record(entry); err != nil {
			logger.Error("Failed to write the audit log:", err)
		}
		if code != rega.SetOK {
			s.sendRequestError(client, msg.RequestID, errorMsg, code)
		}
	}
	if s.auth == nil || client.user == "" {
		finish("NOT_SUPPORTED", "passwords are only used with authentication")
		return
	}
	if !canOperate(client.level) {
		finish("FORBIDDEN", "guests may not change their password")
		return
	}
	if err := s.auth.CheckPassword(client.user, msg.CurrentPassword); err != nil {
		switch err {
		case auth.ErrInvalidCredentials:
			finish("INVALID_CREDENTIALS", "the current password is wrong")
		case auth.ErrTooManyAttempts:
			finish("TOO_MANY_ATTEMPTS", err.Error())
		default:
			finish("CCU_UNREACHABLE", err.Error())
		}
		return
	}
	result, err := s.regaClient.SetUserPassword(client.user, msg.NewPassword)
	if err != nil {
		code := "CCU_ERROR"
		if strings.HasPrefix(err.Error(), "invalid") {
			code = "INVALID_VALUE"
		}
		finish(code, "changePassword failed: "+err.Error())
		return
	}
	if result != rega.SetOK {
		finish(result, "changePassword: "+result)
		return
	}
	// The other devices of this user must log in again
	current := client.SessionID()
	for _, session := range s.auth.Sessions() {
		if session.User == client.user && session.ID != current {
			s.auth.Revoke(session.ID)
		}
	}
	finish(rega.SetOK, "")
	s.sendJSON(client, changeResponse{Type: "changePassword_response", RequestID: msg.RequestID, Success: true})
}
