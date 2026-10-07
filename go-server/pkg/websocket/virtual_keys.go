package websocket

import "ccu-addon-mui-server/pkg/home"

type virtualKeysResponse struct {
	Type      string            `json:"type"`
	RequestID string            `json:"requestId,omitempty"`
	Keys      []home.VirtualKey `json:"keys"`
}

// virtualKeys is a home model that lists the central's virtual keys itself
// (openccu-lite, from the interface processes)
type virtualKeys interface {
	GetVirtualKeys() ([]home.VirtualKey, error)
}

// handleVirtualKeys lists the central's virtual keys: from the ReGa on a
// CCU, with how many programs use them; on openccu-lite from the devices
func (s *Server) handleVirtualKeys(client *Client, requestID string) {
	var keys []home.VirtualKey
	var err error
	switch source := s.home.(type) {
	case virtualKeys:
		keys, err = source.GetVirtualKeys()
	default:
		if s.regaClient == nil {
			s.sendRequestError(client, requestID, "no virtual keys here", "NOT_SUPPORTED")
			return
		}
		keys, err = s.regaClient.GetVirtualKeys()
	}
	if err != nil {
		s.sendRequestError(client, requestID, "getVirtualKeys failed: "+err.Error(), "CCU_ERROR")
		return
	}
	s.sendJSON(client, virtualKeysResponse{Type: "getVirtualKeys_response", RequestID: requestID, Keys: keys})
}
