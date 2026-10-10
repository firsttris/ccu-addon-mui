//go:build !lite

package websocket

import "ccu-addon-mui-server/pkg/rega"

// The ReGa calls of the files both builds share (diagrams, heating groups,
// alarms, system information). Only the CCU's build knows the ReGa client;
// rega_lite.go answers them for openccu-lite.

// sysvarValues: the system variables, for their diagrams
func (s *Server) sysvarValues() ([]rega.Sysvar, error) {
	return s.regaClient.GetSysvars()
}

// historyPage: a page of the system protocol, for older diagram values
func (s *Server) historyPage(start, count int, channel int64) ([]rega.HistoryEntry, int, error) {
	return s.regaClient.GetHistory(start, count, channel)
}

// groupDeviceSetup names a heating group's virtual device and marks the
// members' devices (the WebUI's GroupListPage.ftl)
func (s *Server) groupDeviceSetup(address, name string, rename bool, members, others []string) (string, error) {
	return s.regaClient.SetupGroupDevice(address, name, rename, members, others)
}

// alarmReader reads the alarms, nil without a ReGa
func (s *Server) alarmReader() func() ([]rega.AlarmMessage, error) {
	if s.regaClient == nil {
		return nil
	}
	return s.regaClient.GetAlarmMessages
}

func (s *Server) acknowledgeAlarm(id int64) (result, name string, err error) {
	return s.regaClient.AcknowledgeAlarmMessage(id)
}

// regaBuild is the ReGa's build label, "" if it can't be read
func (s *Server) regaBuild() string {
	if s.regaClient == nil {
		return ""
	}
	build, err := s.regaClient.BuildLabel()
	if err != nil {
		return ""
	}
	return build
}
