package websocket

import (
	"encoding/json"
	"fmt"
	"strings"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/rega"
)

// handleObjects creates, renames and deletes rooms, trades and system
// variables. All of it is setup.
func (s *Server) handleObjects(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		List      string `json:"list"`
		ID        int64  `json:"id"`
		Name      string `json:"name"`
		rega.NewSysvar
		// editSysvar: the info text and the channel (0: none)
		Description string `json:"description"`
		Channel     int64  `json:"channel"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	target := fmt.Sprintf("%s %d", msg.List, msg.ID)
	if strings.HasSuffix(msgType, "Sysvar") {
		target = fmt.Sprintf("sysvar %d", msg.ID)
	}
	var created int64
	switch msgType {
	case "createGroup":
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: msg.List, Value: msg.Name},
			func() (interface{}, string, error) {
				result, id, err := s.homeFor(client).CreateGroup(msg.List, msg.Name)
				created = id
				return nil, result, err
			}, &created)
	case "renameGroup":
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: target, Value: msg.Name},
			func() (interface{}, string, error) {
				result, previous, err := s.homeFor(client).RenameGroup(msg.List, msg.ID, msg.Name)
				return previous, result, err
			})
	case "deleteGroup":
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: target},
			func() (interface{}, string, error) {
				result, previous, err := s.homeFor(client).DeleteGroup(msg.List, msg.ID)
				return previous, result, err
			})
	case "createSysvar":
		// The outer Name takes the JSON field; the embedded one stays empty
		sysvar := msg.NewSysvar
		sysvar.Name = msg.Name
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: msg.Kind, Value: msg.Name},
			func() (interface{}, string, error) {
				result, id, err := s.regaClient.CreateSysvar(sysvar)
				created = id
				return nil, result, err
			}, &created)
	case "editSysvar":
		sysvar := msg.NewSysvar
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: target, Value: sysvar},
			func() (interface{}, string, error) {
				result, err := s.regaClient.EditSysvar(msg.ID, sysvar, msg.Description, msg.Channel)
				return nil, result, err
			})
	case "renameSysvar":
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: target, Value: msg.Name},
			func() (interface{}, string, error) {
				result, previous, err := s.regaClient.RenameSysvar(msg.ID, msg.Name)
				return previous, result, err
			})
	case "deleteSysvar":
		s.configure(client, msg.RequestID, audit.Entry{Action: msgType, Target: target},
			func() (interface{}, string, error) {
				result, previous, err := s.regaClient.DeleteSysvar(msg.ID)
				return previous, result, err
			})
	}
}

// handleRename renames a device or channel.
func (s *Server) handleRename(client *Client, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		Address   string `json:"address"`
		Name      string `json:"name"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	s.configure(client, msg.RequestID, audit.Entry{Action: "rename", Target: msg.Address, Value: msg.Name},
		func() (interface{}, string, error) {
			result, previous, err := s.homeFor(client).SetName(msg.Address, msg.Name)
			return previous, result, err
		})
}

// handleSetGroupMember adds a channel to a room or trade, or removes it.
func (s *Server) handleSetGroupMember(client *Client, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		GroupID   int64  `json:"groupId"`
		ChannelID int64  `json:"channelId"`
		Member    bool   `json:"member"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	target := fmt.Sprintf("group %d channel %d", msg.GroupID, msg.ChannelID)
	s.configure(client, msg.RequestID, audit.Entry{Action: "setGroupMember", Target: target, Value: msg.Member},
		func() (interface{}, string, error) {
			result, err := s.homeFor(client).SetGroupMember(msg.GroupID, msg.ChannelID, msg.Member)
			return !msg.Member, result, err
		})
}
