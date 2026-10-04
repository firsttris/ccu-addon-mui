package websocket

import (
	"encoding/json"
	"errors"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/settings"
)

// SetSettings enables the general settings; diagramsDir is measured for the
// storage shown
func (s *Server) SetSettings(service *settings.Service, diagramsDir string) {
	s.settings = service
	s.diagramsDir = diagramsDir
}

type generalSettings struct {
	EnergyPrice       settings.EnergyPrice `json:"energyPrice"`
	InfoLED           settings.InfoLED     `json:"infoLed"`
	HideStickyUnreach bool                 `json:"hideStickyUnreach"`
	BetaFirmware      bool                 `json:"betaFirmware"`
}

type generalSettingsResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	generalSettings
	Currencies []string         `json:"currencies"`
	Storage    settings.Storage `json:"storage"`
}

func (s *Server) readGeneralSettings() (generalSettings, error) {
	price, err := s.settings.EnergyPrice()
	return generalSettings{
		EnergyPrice:       price,
		InfoLED:           s.settings.InfoLED(),
		HideStickyUnreach: s.settings.Flag(settings.HideStickyUnreach),
		BetaFirmware:      s.settings.Flag(settings.FieldTest),
	}, err
}

// handleGeneralSettings shows and changes the WebUI's general settings
// (StorageSettingsDialog.ftl, and the sticky unreach option of
// userAccountConfigAdmin.htm), for administrators; changes elevated, with
// audit log
func (s *Server) handleGeneralSettings(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		generalSettings
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if client.level != auth.LevelAdmin {
		s.sendRequestError(client, msg.RequestID, "only administrators may see the general settings", "FORBIDDEN")
		return
	}
	if s.settings == nil {
		s.sendRequestError(client, msg.RequestID, "general settings are not available", "NOT_SUPPORTED")
		return
	}
	switch msgType {
	case "getGeneralSettings":
		current, err := s.readGeneralSettings()
		if err != nil {
			s.sendRequestError(client, msg.RequestID, "getGeneralSettings failed: "+err.Error(), "CCU_ERROR")
			return
		}
		s.sendJSON(client, generalSettingsResponse{
			Type: "getGeneralSettings_response", RequestID: msg.RequestID, generalSettings: current,
			Currencies: settings.Currencies, Storage: settings.StorageOf(s.diagramsDir),
		})
	case "setGeneralSettings":
		next := msg.generalSettings
		s.configure(client, msg.RequestID, audit.Entry{Action: "setGeneralSettings", Target: "general settings", Value: next},
			func() (interface{}, string, error) {
				old, _ := s.readGeneralSettings()
				if err := s.settings.SetEnergyPrice(next.EnergyPrice); err != nil {
					if errors.Is(err, settings.ErrInvalid) {
						return nil, "", errors.New("invalid energy price")
					}
					return nil, "", err
				}
				if err := s.settings.SetInfoLED(next.InfoLED); err != nil {
					return old, "", err
				}
				if err := s.settings.SetFlag(settings.HideStickyUnreach, next.HideStickyUnreach); err != nil {
					return old, "", err
				}
				if err := s.settings.SetFlag(settings.FieldTest, next.BetaFirmware); err != nil {
					return old, "", err
				}
				return old, rega.SetOK, nil
			})
	}
}

// hideStickyUnreach drops the service messages of devices that were
// unreachable and acknowledges them, as the WebUI does with the option set
// (serviceMessages.htm: ReceiptAlarm if CCU.getStickyUnreachState)
func (s *Server) hideStickyUnreach(messages []rega.ServiceMessage) []rega.ServiceMessage {
	if s.settings == nil || !s.settings.Flag(settings.HideStickyUnreach) {
		return messages
	}
	shown := messages[:0:0]
	for _, m := range messages {
		if m.Type != "STICKY_UNREACH" {
			shown = append(shown, m)
			continue
		}
		go func(id int64) {
			if _, _, err := s.regaClient.AcknowledgeServiceMessage(id); err != nil {
				logger.Error("Failed to acknowledge a sticky unreach message:", err)
			}
		}(m.ID)
	}
	return shown
}
