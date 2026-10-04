package backup

import (
	"errors"
	"net/url"
	"strings"

	"ccu-addon-mui-server/pkg/logger"
)

// Resetting the CCU to factory settings, as cp_security.cgi does
// (action_factory_reset_check / action_factory_reset_go): with a system
// security key set (crypttool -v -t 0) it must be entered and is checked
// (crypttool -v -t 3); then the add-ons are stopped, the key cleared and
// /usr/local wiped on the next start, which takes this add-on too. So the
// key is checked first through the same calls of the JSON-RPC API
// (BidCoS_RF.isKeySet, BidCoS_RF.validateKey) and the reset runs after the
// answer.

var (
	ErrResetKeyRequired = errors.New("the system security key is needed")
	ErrResetKeyWrong    = errors.New("the system security key is wrong")
)

// CheckFactoryReset checks the session and the key the reset needs
func (s *Service) CheckFactoryReset(username, password, key string) error {
	keySet, err := s.AdminCall(username, password, "BidCoS_RF.isKeySet", nil)
	if err != nil {
		return err
	}
	if keySet != true {
		return nil
	}
	if key == "" {
		return ErrResetKeyRequired
	}
	valid, err := s.AdminCall(username, "", "BidCoS_RF.validateKey", map[string]interface{}{"key": key})
	if err != nil {
		return err
	}
	if valid != true {
		return ErrResetKeyWrong
	}
	return nil
}

// FactoryReset starts the reset (action_factory_reset_go) with the kept
// session; the CCU stops the add-ons, so an answer rarely comes back
func (s *Service) FactoryReset(username, key string) {
	sessionID, err := s.groupSession(username, "")
	if err != nil {
		logger.Error("Factory reset: no WebUI session:", err)
		return
	}
	if key == "" {
		key = "dummy"
	}
	page, err := s.securityAction(sessionID, url.Values{"action": {"factory_reset_go"}, "key": {key}})
	switch {
	case err != nil:
		// Most likely this add-on was stopped by the reset
		logger.Info("Factory reset started:", err)
	case strings.Contains(page, "dialogSetSecKeyRebootFalse"):
		logger.Error("Factory reset refused: wrong system security key")
	default:
		logger.Info("Factory reset started; the CCU restarts")
	}
}
