//go:build !lite

package websocket

import (
	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/rega"
)

type scriptResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	// ReGa's message if the syntax check failed; the script didn't run
	SyntaxError string `json:"syntaxError,omitempty"`
	Output      string `json:"output"`
}

// The audit log keeps the start of a tested script
const auditScriptLength = 200

// handleRunScript tests a HomeMatic script as the WebUI's script editor
// does (webui.js HMScriptExecutor.run, editScript.htm): the syntax check
// first (system.SyntaxCheck), then ReGa.runScript, which the WebUI allows
// administrators only. A script can change anything: elevated, with audit
// log.
func (s *Server) handleRunScript(client *Client, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		Script    string `json:"script"`
	}
	if !s.decode(client, message, &msg) {
		return
	}
	logged := msg.Script
	if len(logged) > auditScriptLength {
		logged = logged[:auditScriptLength] + "…"
	}
	entry := audit.Entry{User: client.user, Action: "runScript", Target: "script", Value: logged}
	finish := func(result string) { s.recordAudit(entry, result) }
	if !s.mayConfigure(client, msg.RequestID, entry) {
		return
	}
	fail := func(err error) {
		code := "CCU_ERROR"
		if err.Error() == "invalid script length" {
			code = "INVALID_VALUE"
		}
		finish(code)
		s.sendRequestError(client, msg.RequestID, "runScript failed: "+err.Error(), code)
	}
	syntaxError, err := s.regaClient.CheckScript(msg.Script)
	if err != nil {
		fail(err)
		return
	}
	if syntaxError != "" {
		finish("SYNTAX_ERROR")
		s.sendJSON(client, scriptResponse{Type: "runScript_response", RequestID: msg.RequestID, SyntaxError: syntaxError})
		return
	}
	output, err := s.regaClient.RunScript(msg.Script)
	if err != nil {
		fail(err)
		return
	}
	finish(rega.SetOK)
	s.sendJSON(client, scriptResponse{Type: "runScript_response", RequestID: msg.RequestID, Output: output})
}
