package websocket

import (
	"encoding/json"
	"fmt"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/rega"
)

type userEntry struct {
	rega.User
	Level string `json:"level"`
}

type usersResponse struct {
	Type      string      `json:"type"`
	RequestID string      `json:"requestId,omitempty"`
	Users     []userEntry `json:"users"`
}

// levelToCCU is the inverse of auth.LevelFromCCU
var levelToCCU = map[string]int{auth.LevelAdmin: 8, auth.LevelUser: 2, auth.LevelGuest: 1}

// handleUsers lists, saves and deletes CCU users, as the WebUI's user
// administration (system.fn: saveUser, deleteUser). Administrators only.
// An administrator can't take their own rights or delete themselves, and
// whoever gets a new password, other rights or is deleted is logged out on
// every device.
func (s *Server) handleUsers(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string  `json:"requestId"`
		ID        int64   `json:"id"`
		FullName  string  `json:"fullName"`
		Level     string  `json:"level"`
		ShowLogin bool    `json:"showLogin"`
		Mail      string  `json:"mail"`
		Phone     string  `json:"phone"`
		Password  *string `json:"password"`
		AutoLogin bool    `json:"autoLogin"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if msgType == "getUsers" {
		if client.level != auth.LevelAdmin {
			s.sendRequestError(client, msg.RequestID, "only administrators may see the users", "FORBIDDEN")
			return
		}
		users, err := s.regaClient.GetUsers()
		if err != nil {
			s.sendRequestError(client, msg.RequestID, "getUsers failed: "+err.Error(), "CCU_ERROR")
			return
		}
		response := usersResponse{Type: "getUsers_response", RequestID: msg.RequestID, Users: []userEntry{}}
		for _, u := range users {
			response.Users = append(response.Users, userEntry{User: u, Level: auth.LevelFromCCU(u.Level)})
		}
		s.sendJSON(client, response)
		return
	}

	// The user as it is now, to keep the own account and log out
	var current *rega.User
	if msg.ID != 0 {
		if users, err := s.regaClient.GetUsers(); err == nil {
			for i := range users {
				if users[i].ID == msg.ID {
					current = &users[i]
				}
			}
		}
	}
	own := current != nil && current.Name == client.user

	if msgType == "deleteUser" {
		target := fmt.Sprintf("user %d", msg.ID)
		if current != nil {
			target = current.Name
		}
		s.configure(client, msg.RequestID, audit.Entry{Action: "deleteUser", Target: target},
			func() (interface{}, string, error) {
				if own {
					return nil, "", fmt.Errorf("invalid: you can't delete yourself")
				}
				result, name, err := s.regaClient.DeleteUser(msg.ID)
				if err == nil && result == rega.SetOK {
					s.logOutUser(name)
				}
				return nil, result, err
			})
		return
	}

	// saveUser
	level, ok := levelToCCU[msg.Level]
	name, _, _ := rega.UserNames(msg.FullName)
	var createdID int64
	s.configure(client, msg.RequestID, audit.Entry{Action: "saveUser", Target: name, Value: msg.Level},
		func() (interface{}, string, error) {
			if !ok {
				return nil, "", fmt.Errorf("invalid level")
			}
			if msg.ID != 0 && current == nil {
				return nil, rega.SetNotFound, nil
			}
			if own && (level != current.Level || name != current.Name) {
				return nil, "", fmt.Errorf("invalid: you can't change your own name or rights")
			}
			var previous interface{}
			if current != nil {
				previous = current.Name + " (" + auth.LevelFromCCU(current.Level) + ")"
			}
			result, id, err := s.regaClient.SaveUser(rega.UserInput{
				ID: msg.ID, FullName: msg.FullName, Level: level, ShowLogin: msg.ShowLogin,
				Mail: msg.Mail, Phone: msg.Phone, Password: msg.Password, AutoLogin: msg.AutoLogin,
			})
			createdID = id
			if err == nil && result == rega.SetOK && current != nil && !own &&
				(msg.Password != nil || level != current.Level || name != current.Name) {
				s.logOutUser(current.Name)
			}
			return previous, result, err
		}, &createdID)
}

// logOutUser revokes every session of a user
func (s *Server) logOutUser(user string) {
	if s.auth == nil {
		return
	}
	for _, session := range s.auth.Sessions() {
		if session.User == user {
			s.auth.Revoke(session.ID)
			s.disconnectSession(session.ID, nil)
		}
	}
	s.endWebUISession(user)
}
