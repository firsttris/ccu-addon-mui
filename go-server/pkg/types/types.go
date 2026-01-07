package types

import "time"

// CCUEvent represents an event from the CCU
type CCUEvent struct {
	Event Event `json:"event"`
}

// Event contains the event details
type Event struct {
	Interface string      `json:"interface"`
	Channel   string      `json:"channel"`
	Datapoint string      `json:"datapoint"`
	Value     interface{} `json:"value"`
	Timestamp string      `json:"timestamp"`
}

// NewCCUEvent creates a new CCU event
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

// WebSocket Message Types

// ScriptMessage represents a Rega script execution request
type ScriptMessage struct {
	Type      string `json:"type"`
	Script    string `json:"script"`
	RequestID string `json:"requestId,omitempty"`
}

// SetValueMessage represents a datapoint value change request
type SetValueMessage struct {
	Type      string      `json:"type"`
	Address   string      `json:"address"`
	Datapoint string      `json:"datapoint"`
	Value     interface{} `json:"value"`
	RequestID string      `json:"requestId,omitempty"`
}

// SubscribeMessage represents a channel subscription request
type SubscribeMessage struct {
	Type      string   `json:"type"`
	DeviceID  string   `json:"deviceId"`
	Channels  []string `json:"channels"`
	RequestID string   `json:"requestId,omitempty"`
}

// ScriptResponse is sent back to the client after script execution
type ScriptResponse struct {
	Type      string      `json:"type"`
	Result    interface{} `json:"result"`
	RequestID string      `json:"requestId,omitempty"`
}

// SubscribeResponse is sent back after successful subscription
type SubscribeResponse struct {
	Type      string   `json:"type"`
	Success   bool     `json:"success"`
	DeviceID  string   `json:"deviceId"`
	Channels  []string `json:"channels"`
	RequestID string   `json:"requestId,omitempty"`
}

// ErrorResponse is sent when an error occurs
type ErrorResponse struct {
	Type  string `json:"type"`
	Error string `json:"error"`
}
