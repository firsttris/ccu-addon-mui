package websocket

import (
	"strings"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/rega"
)

type changeResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	Success   bool   `json:"success"`
	// ID of a created object
	ID int64 `json:"id,omitempty"`
}

// configure runs a change of the setup area for client: checks that it may
// change settings, runs change and records the outcome. change returns the
// previous value (for the audit log) and a ReGa result.
// createdID, if given, is set by change to the id of a created object and
// sent with the response.
func (s *Server) configure(client *Client, requestID string, entry audit.Entry, change func() (previous interface{}, result string, err error), createdID ...*int64) {
	entry.User = client.user
	finish := func(result string) { s.recordAudit(entry, result) }
	if code, errorMsg := configureError(client); code != "" {
		finish(code)
		s.sendRequestError(client, requestID, errorMsg, code)
		return
	}
	previous, result, err := change()
	if err != nil {
		code := "CCU_ERROR"
		if strings.HasPrefix(err.Error(), "invalid") {
			code = "INVALID_VALUE"
		}
		finish(code)
		s.sendRequestError(client, requestID, entry.Action+" failed: "+err.Error(), code)
		return
	}
	if result != rega.SetOK {
		finish(result)
		s.sendRequestError(client, requestID, entry.Action+": "+result, result)
		return
	}
	entry.Previous = previous
	finish(rega.SetOK)
	response := changeResponse{Type: entry.Action + "_response", RequestID: requestID, Success: true}
	if len(createdID) > 0 && createdID[0] != nil {
		response.ID = *createdID[0]
	}
	s.sendJSON(client, response)
}
