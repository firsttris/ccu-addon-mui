package backup

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
)

// Heating groups through the HMServer's group administration
// (/pages/jpages/group/*, GroupAdministrationController), as the WebUI's
// GroupEditPage.ftl calls it. Saving and deleting need a WebUI session; it
// is kept per user after the password was entered once and asked for again
// when the HMServer no longer accepts it.

var (
	// ErrSessionRequired means the password is needed for a new session
	ErrSessionRequired = errors.New("a WebUI session is needed")
	ErrGroupFailed     = errors.New("the HMServer refused the heating group")
)

// GroupMember is a channel a heating group may contain (BidCosGroupMember;
// its id is the label, which is the member's id too)
type GroupMember struct {
	ID   string `json:"id"`
	Type string `json:"type"`
}

// SuitableMembers are the members free for a group type and those already
// in other groups (SuitableGroupMembersDto)
type SuitableMembers struct {
	Assignable []GroupMember `json:"assignable"`
	Leftover   []GroupMember `json:"leftover"`
}

// GroupChange is a heating group to save (GroupAdministrationController.save)
type GroupChange struct {
	// 0 for a new group
	ID                    int
	Name                  string
	Type                  string
	ForbidSingleOperation bool
	Members               []string
	// The name of the group's virtual device
	DeviceName string
}

type hmserverResponse struct {
	IsSuccessful bool   `json:"isSuccessful"`
	ErrorCode    string `json:"errorCode"`
	Content      string `json:"content"`
}

// The HMServer's code for a session it does not accept
const sessionInvalidCode = "42"

type groupSessions struct {
	mu       sync.Mutex
	sessions map[string]string
}

func (s *Service) groupSession(username, password string) (string, error) {
	s.groupSessionsOnce.Do(func() { s.groupSessions = &groupSessions{sessions: map[string]string{}} })
	if password != "" {
		sessionID, err := s.login(username, password)
		if err != nil {
			return "", err
		}
		s.groupSessions.mu.Lock()
		old := s.groupSessions.sessions[username]
		s.groupSessions.sessions[username] = sessionID
		s.groupSessions.mu.Unlock()
		if old != "" {
			go s.logout(old)
		}
		return sessionID, nil
	}
	s.groupSessions.mu.Lock()
	defer s.groupSessions.mu.Unlock()
	if sessionID := s.groupSessions.sessions[username]; sessionID != "" {
		return sessionID, nil
	}
	return "", ErrSessionRequired
}

func (s *Service) forgetGroupSession(username string) {
	s.groupSessions.mu.Lock()
	defer s.groupSessions.mu.Unlock()
	delete(s.groupSessions.sessions, username)
}

func (s *Service) hmserver(path, sessionID string, params interface{}, result interface{}) error {
	return s.hmserverPage("/pages/jpages/group/"+path, sessionID, params, result)
}

// hmserverPage posts JSON to an HMServer page and decodes its answer
func (s *Service) hmserverPage(page, sessionID string, params interface{}, result interface{}) error {
	body, _ := json.Marshal(params)
	u := s.webUIURL + page
	if sessionID != "" {
		u += "?sid=@" + sessionID + "@"
	}
	// As Prototype's Ajax.Request sends a postBody
	resp, err := s.httpClient.Post(u, "application/x-www-form-urlencoded; charset=UTF-8", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("CCU not reachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("the HMServer returned status %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return err
	}
	return json.Unmarshal(data, result)
}

// SuitableGroupMembers lists the channels a group of the type may contain
func (s *Service) SuitableGroupMembers(groupType string) (SuitableMembers, error) {
	var dto struct {
		Assignable []struct {
			ID, SerialNumber, Type string
		} `json:"assignableGroupMembers"`
		Leftover []struct {
			ID, SerialNumber, Type string
		} `json:"leftoverGroupMembers"`
	}
	result := SuitableMembers{Assignable: []GroupMember{}, Leftover: []GroupMember{}}
	if err := s.hmserver("suitableGroupMembers", "", map[string]string{"groupTypeId": groupType}, &dto); err != nil {
		return result, err
	}
	for _, m := range dto.Assignable {
		result.Assignable = append(result.Assignable, GroupMember{ID: m.SerialNumber, Type: m.Type})
	}
	for _, m := range dto.Leftover {
		result.Leftover = append(result.Leftover, GroupMember{ID: m.SerialNumber, Type: m.Type})
	}
	return result, nil
}

// withSession runs a call with the user's WebUI session; a session the
// HMServer no longer accepts is forgotten and the password asked for
func (s *Service) withSession(username, password string, call func(sessionID string) (hmserverResponse, error)) (hmserverResponse, error) {
	sessionID, err := s.groupSession(username, password)
	if err != nil {
		return hmserverResponse{}, err
	}
	response, err := call(sessionID)
	if err != nil {
		return response, err
	}
	if !response.IsSuccessful && response.ErrorCode == sessionInvalidCode {
		s.forgetGroupSession(username)
		return response, ErrSessionRequired
	}
	if !response.IsSuccessful {
		return response, fmt.Errorf("%w: %s %s", ErrGroupFailed, response.ErrorCode, response.Content)
	}
	return response, nil
}

// SaveHeatingGroup creates (ID 0) or changes a heating group and returns
// its id
func (s *Service) SaveHeatingGroup(username, password string, g GroupChange) (int, error) {
	members := g.Members
	if members == nil {
		members = []string{}
	}
	params := map[string]interface{}{
		"groupId": g.ID,
		// escape() in GroupEditPage.ftl; the HMServer decodes it as
		// ISO-8859-1
		"groupName":             jsEscape(g.Name),
		"groupTypeId":           g.Type,
		"forbidSingleOperation": g.ForbidSingleOperation,
		"assignedDevicesIds":    members,
		"isNewGroup":            g.ID == 0,
		"groupDeviceName":       g.DeviceName,
	}
	response, err := s.withSession(username, password, func(sessionID string) (hmserverResponse, error) {
		var r hmserverResponse
		return r, s.hmserver("save", sessionID, params, &r)
	})
	if err != nil {
		return 0, err
	}
	id, err := strconv.Atoi(strings.TrimSpace(response.Content))
	if err != nil {
		return 0, fmt.Errorf("unexpected answer of the HMServer: %q", response.Content)
	}
	return id, nil
}

// DeleteHeatingGroup deletes a heating group
func (s *Service) DeleteHeatingGroup(username, password string, id int) error {
	_, err := s.withSession(username, password, func(sessionID string) (hmserverResponse, error) {
		var r hmserverResponse
		return r, s.hmserver("delete", sessionID, map[string]int{"groupId": id}, &r)
	})
	return err
}

// jsEscape is JavaScript's escape(): Latin-1 characters as %XX, which the
// HMServer's URLDecoder reads as ISO-8859-1; others become "?"
func jsEscape(text string) string {
	var b strings.Builder
	for _, r := range text {
		switch {
		case r < 128 && (r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || strings.ContainsRune("@*_+-./", r)):
			b.WriteRune(r)
		case r < 256:
			fmt.Fprintf(&b, "%%%02X", r)
		default:
			b.WriteString("%3F")
		}
	}
	return b.String()
}
