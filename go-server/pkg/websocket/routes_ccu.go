//go:build !lite

package websocket

import (
	"net/http"
	"time"

	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/rega"
)

// platformRoutes adds what only a CCU serves: backups, restore uploads and
// the logs
func (s *Server) platformRoutes(mux *http.ServeMux) {
	if s.backup != nil {
		mux.Handle(BackupPath, s.backup)
		mux.HandleFunc(RestorePath, s.serveRestoreUpload)
	}
	if s.logs != nil {
		mux.Handle(LogsPath, s.logs)
	}
}

// autoLoginUser is the user the CCU logs in automatically, "" for none or
// an administrator
func (s *Server) autoLoginUser() string {
	if s.regaClient == nil {
		return ""
	}
	users, err := s.autoLoginUsers.get(time.Minute, s.regaClient.GetUsers)
	if err != nil {
		return ""
	}
	for _, u := range users {
		if u.AutoLogin && u.Level != levelToCCU[auth.LevelAdmin] {
			return u.Name
		}
	}
	return ""
}

// SetRega connects the CCU's ReGa: the home model and what only a CCU has
// (programs, system variables, users)
func (s *Server) SetRega(client *rega.Client) {
	s.regaClient = client
	// A nil client must stay a nil interface
	if client != nil {
		s.home = client
	}
}
