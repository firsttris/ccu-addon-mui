//go:build lite

package websocket

// dispatchPlatform: openccu-lite has no ReGa and no WebUI. Its system
// settings are occulited's; programs, system variables and alarms do not
// exist there (dispatch_ccu.go has them for a CCU).
func (s *Server) dispatchPlatform(client *Client, msgType, requestID string, message []byte) bool {
	return false
}
