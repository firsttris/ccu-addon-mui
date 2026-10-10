//go:build !lite

package websocket

import (
	"encoding/json"
	"errors"
	"time"

	"ccu-addon-mui-server/pkg/addons"
	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
)

type addonsResponse struct {
	Type      string         `json:"type"`
	RequestID string         `json:"requestId,omitempty"`
	Addons    []addons.Addon `json:"addons"`
}

type addonUpdateResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	Latest    string `json:"latest"`
}

// handleAddons lists the add-ons, runs an operation (restart, uninstall) or
// checks for a new version, as the WebUI's Zusatzsoftware dialog.
// Administrators only.
func (s *Server) handleAddons(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string `json:"requestId"`
		ID        string `json:"id"`
		Operation string `json:"operation"`
		Language  string `json:"language"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if s.addons == nil {
		s.sendRequestError(client, msg.RequestID, "add-ons are not available", "NOT_SUPPORTED")
		return
	}
	switch msgType {
	case "getAddons", "checkAddonUpdate":
		if client.level != auth.LevelAdmin {
			s.sendRequestError(client, msg.RequestID, "only administrators may see the add-ons", "FORBIDDEN")
			return
		}
		list := s.addons.List(msg.Language)
		if msgType == "getAddons" {
			s.sendJSON(client, addonsResponse{Type: "getAddons_response", RequestID: msg.RequestID, Addons: list})
			return
		}
		for _, addon := range list {
			if addon.ID == msg.ID && addon.UpdateURL != "" {
				latest, err := s.addons.CheckUpdate(addon.UpdateURL, addon.Version)
				if err != nil {
					s.sendRequestError(client, msg.RequestID, "update check failed: "+err.Error(), "CCU_ERROR")
					return
				}
				s.sendJSON(client, addonUpdateResponse{Type: "checkAddonUpdate_response", RequestID: msg.RequestID, Latest: latest})
				return
			}
		}
		s.sendRequestError(client, msg.RequestID, "no such add-on with an update URL", rega.SetNotFound)
	case "addonAction":
		// Restarting this add-on stops this server: answer first, run after
		later := msg.ID == s.addons.SelfID && msg.Operation == "restart"
		ran := false
		s.configure(client, msg.RequestID, audit.Entry{Action: "addonAction", Target: msg.ID, Value: msg.Operation},
			func() (any, string, error) {
				if later {
					if !s.addons.Offers(msg.ID, msg.Operation) {
						return nil, rega.SetNotFound, nil
					}
					ran = true
					return nil, rega.SetOK, nil
				}
				_, err := s.addons.Run(msg.ID, msg.Operation)
				if errors.Is(err, addons.ErrNotFound) {
					return nil, rega.SetNotFound, nil
				}
				if err != nil {
					return nil, "", err
				}
				return nil, rega.SetOK, nil
			})
		if later && ran {
			time.AfterFunc(time.Second, func() {
				if _, err := s.addons.Run(msg.ID, msg.Operation); err != nil {
					logger.Error("Failed to restart the add-on:", err)
				}
			})
		}
	}
}
