package subscriptions

import (
	"sync"

	"ccu-addon-mui-server/pkg/types"
)

// Manager handles device subscriptions to channels
type Manager struct {
	mu            sync.RWMutex
	subscriptions map[string]map[string]bool // deviceId -> channel -> exists
}

// NewManager creates a new subscription manager
func NewManager() *Manager {
	return &Manager{
		subscriptions: make(map[string]map[string]bool),
	}
}

// Subscribe adds channel subscriptions for a device
func (m *Manager) Subscribe(deviceID string, channels []string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	channelSet := make(map[string]bool, len(channels))
	for _, channel := range channels {
		channelSet[channel] = true
	}
	m.subscriptions[deviceID] = channelSet
}

// Unsubscribe removes all subscriptions for a device
func (m *Manager) Unsubscribe(deviceID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.subscriptions, deviceID)
}

// ShouldReceiveEvent checks if a device should receive this event
func (m *Manager) ShouldReceiveEvent(deviceID string, event *types.CCUEvent) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	channels, exists := m.subscriptions[deviceID]
	if !exists {
		return false
	}

	hasChannel := channels[event.Event.Channel]
	return hasChannel
}

// GetSubscriptions returns all subscribed channels for a device
func (m *Manager) GetSubscriptions(deviceID string) []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	channels, exists := m.subscriptions[deviceID]
	if !exists {
		return []string{}
	}

	result := make([]string, 0, len(channels))
	for channel := range channels {
		result = append(result, channel)
	}
	return result
}

// Stats represents subscription statistics
type Stats struct {
	Devices       int
	TotalChannels int
}

// GetStats returns current subscription statistics
func (m *Manager) GetStats() Stats {
	m.mu.RLock()
	defer m.mu.RUnlock()

	totalChannels := 0
	for _, channels := range m.subscriptions {
		totalChannels += len(channels)
	}

	return Stats{
		Devices:       len(m.subscriptions),
		TotalChannels: totalChannels,
	}
}
