package websocket

import (
	"errors"
	"strings"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/rega"
)

// A change or action the user may not make, answered with FORBIDDEN (an
// error that wraps it says why)
var errForbidden = errors.New("forbidden")

type changeResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	Success   bool   `json:"success"`
	// ID of a created object
	ID int64 `json:"id,omitempty"`
}

// mayConfigure says whether client may change settings now; if not, the
// refusal is recorded with entry and answered
func (s *Server) mayConfigure(client *Client, requestID string, entry audit.Entry) bool {
	code, errorMsg := configureError(client)
	if code == "" {
		return true
	}
	s.recordAudit(entry, code)
	s.sendRequestError(client, requestID, errorMsg, code)
	return false
}

// configure runs a change of the setup area for client: checks that it may
// change settings, runs change and records the outcome. change returns the
// previous value (for the audit log) and a ReGa result.
// createdID, if given, is set by change to the id of a created object and
// sent with the response.
func (s *Server) configure(client *Client, requestID string, entry audit.Entry, change func() (previous any, result string, err error), createdID ...*int64) {
	entry.User = client.user
	if !s.mayConfigure(client, requestID, entry) {
		return
	}
	s.finishChange(client, requestID, entry, change, createdID...)
}

// operate runs an operating action for client (running a program, setting
// a variable, acknowledging a message), as configure runs a change: guests
// may not, the outcome goes to the audit log
func (s *Server) operate(client *Client, requestID string, entry audit.Entry, action func() (previous any, result string, err error)) {
	entry.User = client.user
	if !canOperate(client.level) {
		s.recordAudit(entry, "FORBIDDEN")
		s.sendRequestError(client, requestID, "guests may not "+entry.Action, "FORBIDDEN")
		return
	}
	s.finishChange(client, requestID, entry, action)
}

// finishChange runs change and answers with its outcome, recorded with
// entry: its error, its ReGa result other than OK, or success
func (s *Server) finishChange(client *Client, requestID string, entry audit.Entry, change func() (previous any, result string, err error), createdID ...*int64) {
	finish := func(result string) { s.recordAudit(entry, result) }
	previous, result, err := change()
	if err != nil {
		code := "CCU_ERROR"
		switch {
		case errors.Is(err, errForbidden):
			code = "FORBIDDEN"
		case strings.HasPrefix(err.Error(), "invalid"):
			code = "INVALID_VALUE"
		}
		finish(code)
		s.sendRequestError(client, requestID, entry.Action+" failed: "+err.Error(), code)
		return
	}
	// The previous value also for a refused change, as ReGa told it
	entry.Previous = previous
	if result != rega.SetOK {
		finish(result)
		s.sendRequestError(client, requestID, entry.Action+": "+result, result)
		return
	}
	finish(rega.SetOK)
	response := changeResponse{Type: entry.Action + "_response", RequestID: requestID, Success: true}
	if len(createdID) > 0 && createdID[0] != nil {
		response.ID = *createdID[0]
	}
	s.sendJSON(client, response)
}
