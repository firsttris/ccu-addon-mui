package websocket

import (
	"net/url"
	"time"

	"ccu-addon-mui-server/pkg/push"
)

func (s *Server) SetPush(store *push.Store, notifier *push.Notifier) {
	s.pushStore = store
	s.notifier = notifier
}

type pushResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	// The key browsers subscribe with
	PublicKey string `json:"publicKey"`
	// The device's subscription, if any
	Subscribed bool `json:"subscribed"`
	Alarms     bool `json:"alarms"`
	Service    bool `json:"service"`
	Rules      bool `json:"rules"`
}

// handlePush subscribes a device to notifications about new alarms and
// service messages, and sends test notifications. Any logged-in user.
func (s *Server) handlePush(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID    string            `json:"requestId"`
		Endpoint     string            `json:"endpoint"`
		Subscription push.Subscription `json:"subscription"`
		Alarms       bool              `json:"alarms"`
		Service      bool              `json:"service"`
		Rules        bool              `json:"rules"`
		Language     string            `json:"language"`
		Device       string            `json:"device"`
	}
	if !s.decode(client, message, &msg) {
		return
	}
	if s.notifier == nil {
		s.sendRequestError(client, msg.RequestID, "push notifications are not available", "UNAVAILABLE")
		return
	}
	switch msgType {
	case "getPush":
		entry, ok := s.pushStore.Get(msg.Endpoint)
		s.sendJSON(client, pushResponse{
			Type: "getPush_response", RequestID: msg.RequestID, PublicKey: s.notifier.PublicKey(),
			Subscribed: ok && msg.Endpoint != "", Alarms: entry.Alarms, Service: entry.Service, Rules: entry.Rules,
		})
		return
	case "subscribePush":
		u, err := url.Parse(msg.Subscription.Endpoint)
		if err != nil || u.Scheme != "https" || u.Host == "" || msg.Subscription.Keys.P256dh == "" || msg.Subscription.Keys.Auth == "" {
			s.sendRequestError(client, msg.RequestID, "invalid subscription", "INVALID_VALUE")
			return
		}
		language := "de"
		if msg.Language == "en" {
			language = "en"
		}
		err = s.pushStore.Put(push.Entry{
			Subscription: msg.Subscription, User: client.user, Device: msg.Device, Language: language,
			Alarms: msg.Alarms, Service: msg.Service, Rules: msg.Rules, Created: time.Now(),
		})
		if err != nil {
			s.sendRequestError(client, msg.RequestID, "subscribePush failed: "+err.Error(), "CCU_ERROR")
			return
		}
	case "unsubscribePush":
		if _, err := s.pushStore.Remove(msg.Endpoint); err != nil {
			s.sendRequestError(client, msg.RequestID, "unsubscribePush failed: "+err.Error(), "CCU_ERROR")
			return
		}
	case "testPush":
		if err := s.notifier.Test(msg.Endpoint, "ccu-addon-mui", "Test"); err != nil {
			s.sendRequestError(client, msg.RequestID, "testPush failed: "+err.Error(), "PUSH_FAILED")
			return
		}
	}
	s.sendJSON(client, changeResponse{Type: msgType + "_response", RequestID: msg.RequestID, Success: true})
}
