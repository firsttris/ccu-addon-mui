//go:build !lite

package websocket

import (
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
	var msg userRequest
	if !s.decode(client, message, &msg) {
		return
	}
	switch msgType {
	case "getUsers":
		s.listUsers(client, msg)
	case "deleteUser":
		s.deleteUser(client, msg, s.userByID(msg.ID))
	case "saveUser":
		s.saveUser(client, msg, s.userByID(msg.ID))
	}
}

type userRequest struct {
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

func (s *Server) listUsers(client *Client, msg userRequest) {
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
}

// userByID is the user as it is now, to keep the own account and log out;
// nil for a new one or an unknown id
func (s *Server) userByID(id int64) *rega.User {
	if id == 0 {
		return nil
	}
	users, err := s.regaClient.GetUsers()
	if err != nil {
		return nil
	}
	for i := range users {
		if users[i].ID == id {
			return &users[i]
		}
	}
	return nil
}

func (s *Server) deleteUser(client *Client, msg userRequest, current *rega.User) {
	target := fmt.Sprintf("user %d", msg.ID)
	if current != nil {
		target = current.Name
	}
	own := current != nil && current.Name == client.user
	s.configure(client, msg.RequestID, audit.Entry{Action: "deleteUser", Target: target},
		func() (any, string, error) {
			if own {
				return nil, "", fmt.Errorf("invalid: you can't delete yourself")
			}
			result, name, err := s.regaClient.DeleteUser(msg.ID)
			if err == nil && result == rega.SetOK {
				s.logOutUser(name)
				s.autoLoginUsers.forget()
			}
			return nil, result, err
		})
}

func (s *Server) saveUser(client *Client, msg userRequest, current *rega.User) {
	level, ok := levelToCCU[msg.Level]
	name, _, _ := rega.UserNames(msg.FullName)
	own := current != nil && current.Name == client.user
	var createdID int64
	s.configure(client, msg.RequestID, audit.Entry{Action: "saveUser", Target: name, Value: msg.Level},
		func() (any, string, error) {
			if !ok {
				return nil, "", fmt.Errorf("invalid level")
			}
			if msg.ID != 0 && current == nil {
				return nil, rega.SetNotFound, nil
			}
			if own && (level != current.Level || name != current.Name) {
				return nil, "", fmt.Errorf("invalid: you can't change your own name or rights")
			}
			var previous any
			if current != nil {
				previous = current.Name + " (" + auth.LevelFromCCU(current.Level) + ")"
			}
			result, id, err := s.regaClient.SaveUser(rega.UserInput{
				ID: msg.ID, FullName: msg.FullName, Level: level, ShowLogin: msg.ShowLogin,
				Mail: msg.Mail, Phone: msg.Phone, Password: msg.Password, AutoLogin: msg.AutoLogin,
			})
			createdID = id
			if err != nil || result != rega.SetOK {
				return previous, result, err
			}
			// The automatic login may have changed
			s.autoLoginUsers.forget()
			if current != nil && !own && (msg.Password != nil || level != current.Level || name != current.Name) {
				s.logOutUser(current.Name)
			}
			return previous, result, nil
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
