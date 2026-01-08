package types

import "time"

type CCUEvent struct {
	Event Event `json:"event"`
}

type Event struct {
	Interface string      `json:"interface"`
	Channel   string      `json:"channel"`
	Datapoint string      `json:"datapoint"`
	Value     interface{} `json:"value"`
	Timestamp string      `json:"timestamp"`
}

func NewCCUEvent(interfaceName, channel, datapoint string, value interface{}) *CCUEvent {
	return &CCUEvent{
		Event: Event{
			Interface: interfaceName,
			Channel:   channel,
			Datapoint: datapoint,
			Value:     value,
			Timestamp: time.Now().Format(time.RFC3339),
		},
	}
}


type SubscribeMessage struct {
	Type      string   `json:"type"`
	DeviceID  string   `json:"deviceId"`
	Channels  []string `json:"channels"`
	RequestID string   `json:"requestId,omitempty"`
}

type SubscribeResponse struct {
	Type      string   `json:"type"`
	Success   bool     `json:"success"`
	DeviceID  string   `json:"deviceId"`
	Channels  []string `json:"channels"`
	RequestID string   `json:"requestId,omitempty"`
}

type ErrorResponse struct {
	Type  string `json:"type"`
	Error string `json:"error"`
}
