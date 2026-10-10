package websocket

import "encoding/json"

// decode reads a request into msg (a pointer). One that does not parse is
// answered at once with INVALID_REQUEST and, if it carries one, its
// requestId, so the app's request fails without waiting; decode then
// reports false and the handler ends.
func (s *Server) decode(client *Client, message []byte, msg any) bool {
	err := json.Unmarshal(message, msg)
	if err == nil {
		return true
	}
	var head struct {
		RequestID string `json:"requestId"`
	}
	_ = json.Unmarshal(message, &head)
	s.sendRequestError(client, head.RequestID, "invalid message: "+err.Error(), "INVALID_REQUEST")
	return false
}
