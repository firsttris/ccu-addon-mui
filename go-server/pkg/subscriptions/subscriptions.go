package subscriptions

import (
	"sync"

	"ccu-addon-mui-server/pkg/types"
)

// Manager tracks channel subscriptions per subscriber. A subscriber is a
// single WebSocket connection, not a deviceId: several browser tabs share the
// same deviceId and must not overwrite or remove each other's subscriptions.
type Manager struct {
	mu            sync.RWMutex
	subscriptions map[string]map[string]bool // subscriberID -> channel -> exists
}

func NewManager() *Manager {
	return &Manager{
		subscriptions: make(map[string]map[string]bool),
	}
}

func (m *Manager) Subscribe(subscriberID string, channels []string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	channelSet := make(map[string]bool, len(channels))
	for _, channel := range channels {
		channelSet[channel] = true
	}
	m.subscriptions[subscriberID] = channelSet
}

func (m *Manager) Unsubscribe(subscriberID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.subscriptions, subscriberID)
}

func (m *Manager) ShouldReceiveEvent(subscriberID string, event *types.CCUEvent) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	channels, exists := m.subscriptions[subscriberID]
	if !exists {
		return false
	}

	return channels[event.Event.Channel]
}

func (m *Manager) GetSubscriptions(subscriberID string) []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	channels, exists := m.subscriptions[subscriberID]
	if !exists {
		return []string{}
	}

	result := make([]string, 0, len(channels))
	for channel := range channels {
		result = append(result, channel)
	}
	return result
}

type Stats struct {
	Subscribers   int
	TotalChannels int
}

func (m *Manager) GetStats() Stats {
	m.mu.RLock()
	defer m.mu.RUnlock()

	totalChannels := 0
	for _, channels := range m.subscriptions {
		totalChannels += len(channels)
	}

	return Stats{
		Subscribers:   len(m.subscriptions),
		TotalChannels: totalChannels,
	}
}
