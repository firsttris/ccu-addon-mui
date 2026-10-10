//go:build !lite

package websocket

import (
	"encoding/json"
	"os"
	"os/exec"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/logs"
	"ccu-addon-mui-server/pkg/rega"
)

// LogsPath is where the log files are downloaded, next to the WebSocket
const LogsPath = "/ws/mui/logs/"

// SetLogs enables the logging settings and the log download
func (s *Server) SetLogs(service *logs.Service) {
	s.logs = service
}

// restartSyslog: what action_apply_logging runs after saving
var restartSyslog = func() {
	if _, err := os.Stat("/usr/bin/monit"); err != nil {
		return
	}
	if err := exec.Command("/usr/bin/monit", "restart", "syslogd").Run(); err != nil {
		logger.Error("Failed to restart syslogd:", err)
	}
}

type loggingSettings struct {
	Host string `json:"host"`
	// BidCos-RF (rfd), HomeMatic IP server and logic layer (ReGa)
	RFD  int    `json:"rfd"`
	HmIP string `json:"hmip"`
	Rega int    `json:"rega"`
}

type loggingResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	loggingSettings
}

type logsDownloadResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	Success   bool   `json:"success"`
	URL       string `json:"url"`
	FileName  string `json:"fileName"`
}

// handleLogging shows and changes the logging settings of the Zentralen-
// Wartung and hands out a download of the log files, for administrators
// (changes and downloads elevated, with audit log).
func (s *Server) handleLogging(client *Client, msgType string, message []byte) {
	rpc := s.rpcFor(client)
	var msg struct {
		RequestID string `json:"requestId"`
		loggingSettings
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if client.level != auth.LevelAdmin {
		s.sendRequestError(client, msg.RequestID, "only administrators may see the logging settings", "FORBIDDEN")
		return
	}
	if s.logs == nil || !s.logs.Available() {
		s.sendRequestError(client, msg.RequestID, "logging settings are only available on the CCU", "NOT_SUPPORTED")
		return
	}
	switch msgType {
	case "getLogging":
		stored := s.logs.Read()
		current := loggingSettings{Host: stored.Host, RFD: stored.RFD, HmIP: stored.HmIP, Rega: stored.Rega}
		// The running levels, as the WebUI shows them
		if s.rpc != nil {
			if level, err := rpc.LogLevel("BidCos-RF"); err == nil {
				current.RFD = level
			}
		}
		if level, err := s.regaClient.GetLogLevel(); err == nil {
			current.Rega = level
		}
		s.sendJSON(client, loggingResponse{Type: "getLogging_response", RequestID: msg.RequestID, loggingSettings: current})
	case "setLogging":
		next := msg.loggingSettings
		s.configure(client, msg.RequestID, audit.Entry{Action: "setLogging", Target: "logging", Value: next},
			func() (any, string, error) {
				old := s.logs.Read()
				settings := logs.Settings{Host: next.Host, RFD: next.RFD, HS485D: old.HS485D, Rega: next.Rega, HmIP: next.HmIP}
				if err := s.logs.Write(settings); err != nil {
					return nil, "", err
				}
				if old.RFD != next.RFD && s.rpc != nil {
					if err := rpc.SetLogLevel("BidCos-RF", next.RFD); err != nil {
						logger.Error("Failed to set the rfd log level:", err)
					}
				}
				if old.Rega != next.Rega {
					if result, err := s.regaClient.SetLogLevel(next.Rega); err != nil || result != rega.SetOK {
						return old, result, err
					}
				}
				restartSyslog()
				return old, rega.SetOK, nil
			})
	case "downloadLogs":
		entry := audit.Entry{User: client.user, Action: "downloadLogs", Target: "log files"}
		code, errorMsg := configureError(client)
		if code != "" {
			s.recordAudit(entry, code)
		} else {
			s.recordAudit(entry, rega.SetOK)
		}
		if code != "" {
			s.sendRequestError(client, msg.RequestID, errorMsg, code)
			return
		}
		s.sendJSON(client, logsDownloadResponse{
			Type: "downloadLogs_response", RequestID: msg.RequestID, Success: true,
			URL: LogsPath + s.logs.Prepare(), FileName: s.logs.FileName(),
		})
	}
}
