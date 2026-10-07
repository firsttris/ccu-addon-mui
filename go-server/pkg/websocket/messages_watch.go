package websocket

import (
	"bytes"
	"context"
	"encoding/json"
	"sync"
	"time"

	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
)

// Alarms and service messages are kept by ReGa, which sends no events
// (only the interface processes do, for device datapoints, over XML-RPC).
// So the server reads them once for all apps that show them and sends them
// when they changed, instead of every app reading them on its own. The push
// notifier reads the same results (MessageSource).
//
// Alarms are system variables set by programs: there is nothing to wait
// for, they are read every 15 s, like the WebUI does (it polls them with
// UpdateUI). Service messages follow device datapoints (UNREACH, LOW_BAT
// ...): they are read again shortly after such an event, the poll is only a
// fallback for what comes without one (sticky messages acknowledged in the
// WebUI).

const (
	alarmWatchInterval = 15 * time.Second
	serviceWatchEvery  = 20 // polls, i.e. every 5 minutes
	// ReGa turns the event into its service message a moment later
	serviceEventDelay = 2 * time.Second
)

// Datapoints that raise or end a service message (as SERVICE_DATAPOINTS in
// the app)
var serviceDatapoints = map[string]bool{
	"UNREACH": true, "STICKY_UNREACH": true, "LOW_BAT": true, "LOWBAT": true,
	"CONFIG_PENDING": true, "UPDATE_PENDING": true, "SABOTAGE": true, "STICKY_SABOTAGE": true,
	"ERROR_CODE": true, "DUTY_CYCLE": true,
}

// alarmMessagesMessage and serviceMessagesMessage are sent unasked to the
// connections that loaded the list
type alarmMessagesMessage struct {
	Type   string              `json:"type"`
	Alarms []rega.AlarmMessage `json:"alarms"`
}

type serviceMessagesMessage struct {
	Type     string                `json:"type"`
	Messages []rega.ServiceMessage `json:"messages"`
}

// cachedList keeps the last answer of a ReGa script. Callers wait for a
// read already running instead of starting their own.
type cachedList[T any] struct {
	mu    sync.Mutex
	at    time.Time
	value []T
}

// get returns the list if it is younger than maxAge, else reads it (maxAge
// 0: always).
func (c *cachedList[T]) get(maxAge time.Duration, read func() ([]T, error)) ([]T, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if maxAge > 0 && !c.at.IsZero() && time.Since(c.at) < maxAge {
		return c.value, nil
	}
	value, err := read()
	if err != nil {
		return nil, err
	}
	c.value, c.at = value, time.Now()
	return value, nil
}

type messageWatch struct {
	alarms  cachedList[rega.AlarmMessage]
	service cachedList[rega.ServiceMessage]

	mu          sync.Mutex
	lastAlarms  []byte
	lastService []byte
	// A read of the service messages planned after an event
	serviceTimer *time.Timer
}

// ServiceEvent is called with every event of the CCU: one of a service
// datapoint reads the service messages again, once for a burst of events.
// It doesn't block (it runs in the CCU's event callback).
func (s *Server) ServiceEvent(datapoint string) {
	if !serviceDatapoints[datapoint] {
		return
	}
	s.messages.mu.Lock()
	defer s.messages.mu.Unlock()
	if s.messages.serviceTimer == nil {
		s.messages.serviceTimer = time.AfterFunc(serviceEventDelay, func() {
			s.messages.mu.Lock()
			s.messages.serviceTimer = nil
			s.messages.mu.Unlock()
			s.pollServiceMessages(0)
		})
	}
}

func (s *Server) readAlarms(maxAge time.Duration) ([]rega.AlarmMessage, error) {
	return s.messages.alarms.get(maxAge, s.regaClient.GetAlarmMessages)
}

func (s *Server) readServiceMessages(maxAge time.Duration) ([]rega.ServiceMessage, error) {
	return s.messages.service.get(maxAge, s.home.GetServiceMessages)
}

// watchMessages marks a connection that loaded the alarms or the service
// messages: it gets their changes from then on.
func (c *Client) watchMessages(alarms bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if alarms {
		c.alarms = true
	} else {
		c.service = true
	}
}

func (c *Client) watchesMessages(alarms bool) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if alarms {
		return c.alarms
	}
	return c.service
}

// RunMessageWatch reads the alarms every 15 s and the service messages
// every 5 minutes while a connection shows them, and sends them when they
// changed.
func (s *Server) RunMessageWatch(ctx context.Context) {
	ticker := time.NewTicker(alarmWatchInterval)
	defer ticker.Stop()
	for poll := 1; ; poll++ {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.pollAlarms()
			if poll%serviceWatchEvery == 0 {
				s.pollServiceMessages(alarmWatchInterval / 3)
			}
		}
	}
}

func (s *Server) pollAlarms() {
	if s.regaClient == nil || !s.hasMessageWatchers(true) {
		s.messages.mu.Lock()
		s.messages.lastAlarms = nil
		s.messages.mu.Unlock()
		return
	}
	// A list read in the last seconds (a request, the notifier) will do
	alarms, err := s.readAlarms(alarmWatchInterval / 3)
	if err != nil {
		logger.Debugf("Reading the alarms failed: %v", err)
		return
	}
	message, _ := json.Marshal(alarmMessagesMessage{Type: "alarmMessages", Alarms: alarms})
	s.messages.mu.Lock()
	changed := !bytes.Equal(message, s.messages.lastAlarms)
	s.messages.lastAlarms = message
	s.messages.mu.Unlock()
	if changed {
		s.sendToWatchers(true, message)
	}
}

// pollServiceMessages reads the service messages (or takes a read younger
// than maxAge) and sends them if they changed.
func (s *Server) pollServiceMessages(maxAge time.Duration) {
	if s.home == nil || !s.hasMessageWatchers(false) {
		s.messages.mu.Lock()
		s.messages.lastService = nil
		s.messages.mu.Unlock()
		return
	}
	messages, err := s.readServiceMessages(maxAge)
	if err != nil {
		logger.Debugf("Reading the service messages failed: %v", err)
		return
	}
	message, _ := json.Marshal(serviceMessagesMessage{Type: "serviceMessages", Messages: s.hideStickyUnreach(messages)})
	s.messages.mu.Lock()
	changed := !bytes.Equal(message, s.messages.lastService)
	s.messages.lastService = message
	s.messages.mu.Unlock()
	if changed {
		s.sendToWatchers(false, message)
	}
}

func (s *Server) hasMessageWatchers(alarms bool) bool {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()
	for client := range s.clients {
		if client.watchesMessages(alarms) {
			return true
		}
	}
	return false
}

func (s *Server) sendToWatchers(alarms bool, message []byte) {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()
	for client := range s.clients {
		if client.watchesMessages(alarms) {
			s.send(client, message)
		}
	}
}

// MessageSource gives the push notifier the alarms and service messages,
// from the last read if it is younger than maxAge: while apps are open it
// adds no ReGa scripts of its own.
func (s *Server) MessageSource(maxAge time.Duration) *MessageSource {
	return &MessageSource{server: s, maxAge: maxAge}
}

type MessageSource struct {
	server *Server
	maxAge time.Duration
}

func (m *MessageSource) GetAlarmMessages() ([]rega.AlarmMessage, error) {
	return m.server.readAlarms(m.maxAge)
}

func (m *MessageSource) GetServiceMessages() ([]rega.ServiceMessage, error) {
	return m.server.readServiceMessages(m.maxAge)
}

// unwatchMessages: logged out, the connection may not see them any more
func (c *Client) unwatchMessages() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.alarms, c.service = false, false
}
