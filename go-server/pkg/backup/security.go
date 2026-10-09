package backup

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

// The WebUI's security settings (cp_security.cgi): SSH, authentication of
// the remote API, the redirect to HTTPS and the system security key. They
// are changed as the WebUI does, through its JSON-RPC methods and
// cp_security.cgi, with the user's WebUI session kept as for the heating
// groups.

var (
	ErrKeyInvalid  = errors.New("the security key must have at least 5 letters, digits or underscores")
	ErrKeySame     = errors.New("the key is the CCU's current key")
	ErrKeyNotAll   = errors.New("the current key has not reached all devices yet")
	ErrKeyRejected = errors.New("the CCU did not take the key")
)

var keyRegex = regexp.MustCompile(`^[0-9a-zA-Z_]{5,}$`)

// AdminCall runs a JSON-RPC method of the WebUI with the user's session
// (a new one with the password, else the kept one). A kept session the CCU
// no longer accepts is forgotten and the password asked for
// (ErrSessionRequired); other errors of the method are passed on.
func (s *Service) AdminCall(username, password, method string, params map[string]interface{}) (interface{}, error) {
	sessionID, err := s.groupSession(username, password)
	if err != nil {
		return nil, err
	}
	args := map[string]interface{}{"_session_id_": sessionID}
	for k, v := range params {
		args[k] = v
	}
	var response rpcResponse
	if err := s.call(method, args, &response); err != nil {
		return nil, err
	}
	if response.Error != nil {
		if password == "" && response.Error.Code == accessDeniedCode {
			s.forgetGroupSession(username)
			return nil, ErrSessionRequired
		}
		return nil, fmt.Errorf("%s: %s", method, response.Error.Message)
	}
	return response.Result, nil
}

// ChangeSecurityKey sets a new system security key for the BidCos devices
// (cp_security.cgi action_change_key: changeKey to rfd and crypttool)
func (s *Service) ChangeSecurityKey(username, password, key string) error {
	if !keyRegex.MatchString(key) {
		return ErrKeyInvalid
	}
	sessionID, err := s.groupSession(username, password)
	if err != nil {
		return err
	}
	answer, err := s.pageAction(sessionID, "/config/cp_security.cgi", url.Values{"action": {"change_key"}, "key1": {key}, "key2": {key}})
	if err != nil {
		return err
	}
	switch {
	case strings.Contains(answer, "SetKeySucceed"):
		return nil
	case strings.Contains(answer, "KeysIsIdentical"):
		return ErrKeySame
	case strings.Contains(answer, "KeyNotAllDevices"):
		return ErrKeyNotAll
	case strings.Contains(answer, "KeyShort"), strings.Contains(answer, "IllegalChar"):
		return ErrKeyInvalid
	case password == "":
		// Not the page's answer: most likely the session expired
		s.forgetGroupSession(username)
		return ErrSessionRequired
	default:
		return ErrKeyRejected
	}
}
