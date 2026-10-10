//go:build !lite

package websocket

import (
	"fmt"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/rega"
)

type logicResponse struct {
	Type      string         `json:"type"`
	RequestID string         `json:"requestId,omitempty"`
	Success   bool           `json:"success"`
	Sysvars   []rega.Sysvar  `json:"sysvars,omitempty"`
	Programs  []rega.Program `json:"programs,omitempty"`
}

type logicRequest struct {
	RequestID string `json:"requestId"`
	ID        int64  `json:"id"`
	Value     any    `json:"value"`
	Active    bool   `json:"active"`
	// setLogicOption: "visible" or "operate"
	Option string `json:"option"`
}

// handleLogic: system variables and programs. Reading, setting a variable
// and running a program is operating (not for guests); switching a
// program on or off is setup.
func (s *Server) handleLogic(client *Client, msgType string, message []byte) {
	var msg logicRequest
	if !s.decode(client, message, &msg) {
		return
	}
	switch msgType {
	case "getSysvars":
		s.getSysvars(client, msg)
	case "getPrograms":
		s.getPrograms(client, msg)
	case "setProgramActive":
		s.setProgramActive(client, msg)
	case "setLogicOption":
		s.setLogicOption(client, msg)
	case "runProgram":
		s.runProgram(client, msg)
	case "setSysvar":
		s.setSysvar(client, msg)
	}
}

func (s *Server) getSysvars(client *Client, msg logicRequest) {
	sysvars, err := s.regaClient.GetSysvars()
	if err != nil {
		s.sendRequestError(client, msg.RequestID, "getSysvars failed: "+err.Error(), "CCU_ERROR")
		return
	}
	client.watchSysvars(true)
	s.sendJSON(client, logicResponse{Type: "getSysvars_response", RequestID: msg.RequestID, Success: true, Sysvars: sysvars})
}

func (s *Server) getPrograms(client *Client, msg logicRequest) {
	programs, err := s.regaClient.GetPrograms()
	if err != nil {
		s.sendRequestError(client, msg.RequestID, "getPrograms failed: "+err.Error(), "CCU_ERROR")
		return
	}
	s.sendJSON(client, logicResponse{Type: "getPrograms_response", RequestID: msg.RequestID, Success: true, Programs: programs})
}

func (s *Server) setProgramActive(client *Client, msg logicRequest) {
	action := rega.ProgramOff
	if msg.Active {
		action = rega.ProgramOn
	}
	s.configure(client, msg.RequestID, audit.Entry{Action: "setProgramActive", Target: fmt.Sprintf("program %d", msg.ID), Value: msg.Active},
		func() (any, string, error) {
			result, err := s.regaClient.ProgramAction(msg.ID, action)
			return !msg.Active, result, err
		})
}

func (s *Server) setLogicOption(client *Client, msg logicRequest) {
	value, isBool := msg.Value.(bool)
	s.configure(client, msg.RequestID, audit.Entry{Action: "setLogicOption", Target: fmt.Sprintf("%d %s", msg.ID, msg.Option), Value: msg.Value},
		func() (any, string, error) {
			if !isBool {
				return nil, "", fmt.Errorf("invalid value")
			}
			result, previous, err := s.regaClient.SetLogicOption(msg.ID, msg.Option, value)
			return previous, result, err
		})
}

// Only programs marked "bedienbar" for users other than administrators
var errProgramAdminOnly = fmt.Errorf("%w: this program may only be run by administrators", errForbidden)

func (s *Server) runProgram(client *Client, msg logicRequest) {
	s.operate(client, msg.RequestID, audit.Entry{Action: "runProgram", Target: fmt.Sprintf("program %d", msg.ID)},
		func() (any, string, error) {
			if client.level != auth.LevelAdmin && !s.programOperable(msg.ID) {
				return nil, "", errProgramAdminOnly
			}
			result, err := s.regaClient.ProgramAction(msg.ID, rega.ProgramRun)
			return nil, result, err
		})
}

func (s *Server) setSysvar(client *Client, msg logicRequest) {
	s.operate(client, msg.RequestID, audit.Entry{Action: "setSysvar", Target: fmt.Sprintf("sysvar %d", msg.ID), Value: msg.Value},
		func() (any, string, error) {
			value, err := formatValue(msg.Value)
			if err != nil {
				return nil, "", err
			}
			// The app sends numbers and booleans as such; a string is the
			// text of a string variable
			_, text := msg.Value.(string)
			result, previous, err := s.regaClient.SetSysvar(msg.ID, value, text)
			return previous, result, err
		})
}

type programResponse struct {
	Type      string                  `json:"type"`
	RequestID string                  `json:"requestId,omitempty"`
	Program   *rega.ProgramDefinition `json:"program"`
}

// handleProgramEditor reads a program with its rules, saves one (new or
// changed) or deletes one. Changing is setup: administrators only.
func (s *Server) handleProgramEditor(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string                 `json:"requestId"`
		ID        int64                  `json:"id"`
		Program   rega.ProgramDefinition `json:"program"`
	}
	if !s.decode(client, message, &msg) {
		return
	}
	switch msgType {
	case "getProgram":
		program, err := s.regaClient.GetProgram(msg.ID)
		if err != nil {
			s.sendRequestError(client, msg.RequestID, "getProgram failed: "+err.Error(), "CCU_ERROR")
			return
		}
		if program == nil {
			s.sendRequestError(client, msg.RequestID, "getProgram: "+rega.SetNotFound, rega.SetNotFound)
			return
		}
		s.sendJSON(client, programResponse{Type: "getProgram_response", RequestID: msg.RequestID, Program: program})
	case "saveProgram":
		var created int64
		target := fmt.Sprintf("program %d", msg.Program.ID)
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: target, Value: msg.Program.Name},
			func() (any, string, error) {
				result, id, err := s.regaClient.SaveProgram(msg.Program)
				created = id
				return nil, result, err
			}, &created)
	case "deleteProgram":
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: fmt.Sprintf("program %d", msg.ID)},
			func() (any, string, error) {
				result, name, err := s.regaClient.DeleteProgram(msg.ID)
				return name, result, err
			})
	}
}

// programOperable: the program may be run by users other than
// administrators (UserAccessRights full access); unknown programs too, so
// ProgramAction reports them
func (s *Server) programOperable(id int64) bool {
	programs, err := s.regaClient.GetPrograms()
	if err != nil {
		return false
	}
	for _, p := range programs {
		if p.ID == id {
			return p.Operate
		}
	}
	return true
}
