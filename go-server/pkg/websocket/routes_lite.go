//go:build lite

package websocket

import (
	"net/http"

	"ccu-addon-mui-server/pkg/rega"
)

// platformRoutes: openccu-lite has its own backups and logs (occulited)
func (s *Server) platformRoutes(*http.ServeMux) {}

// autoLoginUser: openccu-lite's login page logs in
func (s *Server) autoLoginUser() string { return "" }

// SetRega: openccu-lite has no ReGa; the home model is set with SetHome
func (s *Server) SetRega(*rega.Client) {}
