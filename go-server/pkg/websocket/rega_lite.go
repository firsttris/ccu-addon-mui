//go:build lite

package websocket

import (
	"errors"

	"ccu-addon-mui-server/pkg/rega"
)

// The ReGa calls of the files both builds share, for openccu-lite: it has
// no ReGa, so no system variables, no system protocol and no alarms, and
// occulited sets up the heating groups' devices itself (rega_ccu.go has
// them for a CCU). Its capabilities keep the diagrams from asking.

var errNoRega = errors.New("openccu-lite has no ReGa")

func (s *Server) sysvarValues() ([]rega.Sysvar, error) { return nil, errNoRega }

func (s *Server) historyPage(int, int, int64) ([]rega.HistoryEntry, int, error) {
	return nil, 0, errNoRega
}

func (s *Server) groupDeviceSetup(string, string, bool, []string, []string) (string, error) {
	return "", errNoRega
}

func (s *Server) alarmReader() func() ([]rega.AlarmMessage, error) { return nil }

func (s *Server) acknowledgeAlarm(int64) (string, string, error) { return "", "", errNoRega }

func (s *Server) regaBuild() string { return "" }
