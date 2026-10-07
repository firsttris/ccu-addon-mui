//go:build !lite

package websocket

import (
	"context"
	"errors"
	"fmt"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/selfupdate"
)

type selfUpdateResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	Current   string `json:"current"`
	Latest    string `json:"latest"`
	// The release has an archive for this CCU that can be installed here
	Installable bool `json:"installable"`
}

type installSelfUpdateResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	Success   bool   `json:"success"`
	Version   string `json:"version"`
}

// handleCheckSelfUpdate: the newest release of this add-on, for
// administrators, next to the installed version (the VERSION file).
func (s *Server) handleCheckSelfUpdate(client *Client, requestID string) {
	if client.level != auth.LevelAdmin {
		s.sendRequestError(client, requestID, "only administrators may check for updates", "FORBIDDEN")
		return
	}
	if s.selfUpdate == nil {
		s.sendRequestError(client, requestID, "the update is not available", "NOT_SUPPORTED")
		return
	}
	release, err := s.selfUpdate.Latest()
	if err != nil && !(errors.Is(err, selfupdate.ErrNoAsset) && release.Version != "") {
		s.sendRequestError(client, requestID, "update check failed: "+err.Error(), "CCU_ERROR")
		return
	}
	s.sendJSON(client, selfUpdateResponse{
		Type: "checkSelfUpdate_response", RequestID: requestID,
		Current: addonVersion(), Latest: release.Version,
		// Off the CCU (a server on a PC) update_script has nothing to replace
		Installable: err == nil && onCCU(),
	})
}

// handleInstallSelfUpdate installs the newest release of this add-on
// without rebooting the CCU (package selfupdate). It runs code as root: an
// elevated administrator, the release of this repository only, its
// checksum checked, audit log. The server restarts a few seconds after the
// answer.
func (s *Server) handleInstallSelfUpdate(client *Client, requestID string) {
	entry := audit.Entry{User: client.user, Action: "installSelfUpdate", Target: "mui"}
	fail := func(code string, err error) {
		s.recordAudit(entry, code)
		s.sendRequestError(client, requestID, "installSelfUpdate failed: "+err.Error(), code)
	}
	if code, message := configureError(client); code != "" {
		fail(code, errors.New(message))
		return
	}
	if s.selfUpdate == nil || !onCCU() {
		fail("NOT_SUPPORTED", errors.New("the add-on can only update itself on the CCU"))
		return
	}
	release, err := s.selfUpdate.Latest()
	if err != nil {
		code := "DOWNLOAD_FAILED"
		if errors.Is(err, selfupdate.ErrNoAsset) {
			code = "NOT_SUPPORTED"
		}
		fail(code, err)
		return
	}
	entry.Value = release.Version
	logger.Info(fmt.Sprintf("⬆️ Add-on update to %s started by %q", release.Version, client.user))
	if err := s.selfUpdate.Install(context.Background(), release); err != nil {
		code := "DOWNLOAD_FAILED"
		switch {
		case errors.Is(err, selfupdate.ErrChecksum):
			code = "CHECKSUM"
		case errors.Is(err, selfupdate.ErrRunning):
			code = "UPDATE_RUNNING"
		case errors.Is(err, selfupdate.ErrScript):
			code = "ADDON_FAILED"
		}
		logger.Error("Add-on update failed:", err)
		fail(code, err)
		return
	}
	logger.Info(fmt.Sprintf("⬆️ Add-on updated to %s, the server restarts", release.Version))
	s.recordAudit(entry, rega.SetOK)
	s.sendJSON(client, installSelfUpdateResponse{Type: "installSelfUpdate_response", RequestID: requestID, Success: true, Version: release.Version})
}
