package push

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
)

// Messages is where the notifier looks for news.
type Messages interface {
	GetAlarmMessages() ([]rega.AlarmMessage, error)
	GetServiceMessages() ([]rega.ServiceMessage, error)
}

// Notification is what the service worker shows.
type Notification struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	// Notifications with the same tag replace each other
	Tag string `json:"tag"`
	// Opened on a click, relative to the app
	URL string `json:"url"`
}

// Notifier polls the CCU's alarms and service messages and notifies the
// subscribed devices about new ones.
type Notifier struct {
	store    *Store
	vapid    *VAPID
	messages Messages
	client   *http.Client

	mu   sync.Mutex
	seen map[string]bool
	// The first poll only learns what is there already
	primed bool
}

func NewNotifier(store *Store, vapid *VAPID, messages Messages) *Notifier {
	return &Notifier{store: store, vapid: vapid, messages: messages, client: &http.Client{Timeout: 15 * time.Second}, seen: map[string]bool{}}
}

// PublicKey is the key browsers subscribe with.
func (n *Notifier) PublicKey() string { return n.vapid.PublicKey() }

var serviceTexts = map[string]map[string]string{
	"de": {"UNREACH": "nicht erreichbar", "STICKY_UNREACH": "war nicht erreichbar", "LOW_BAT": "Batterie schwach", "LOWBAT": "Batterie schwach",
		"CONFIG_PENDING": "Konfiguration ausstehend", "SABOTAGE": "Sabotage", "STICKY_SABOTAGE": "Sabotage", "ERROR_CODE": "Fehler", "DUTY_CYCLE": "Duty Cycle erreicht",
		"title": "Servicemeldung", "alarm": "Alarm"},
	"en": {"UNREACH": "unreachable", "STICKY_UNREACH": "was unreachable", "LOW_BAT": "low battery", "LOWBAT": "low battery",
		"CONFIG_PENDING": "configuration pending", "SABOTAGE": "sabotage", "STICKY_SABOTAGE": "sabotage", "ERROR_CODE": "error", "DUTY_CYCLE": "duty cycle reached",
		"title": "Service message", "alarm": "Alarm"},
}

func text(language, key string) string {
	texts, ok := serviceTexts[language]
	if !ok {
		texts = serviceTexts["de"]
	}
	if t, ok := texts[key]; ok {
		return t
	}
	return key
}

func alarmNotification(language string, a rega.AlarmMessage) Notification {
	body := a.Message
	if a.Channel != "" {
		body = strings.TrimSpace(body + " · " + a.Channel)
	}
	if a.RoomName != "" {
		body += " · " + a.RoomName
	}
	return Notification{
		Title: fmt.Sprintf("%s: %s", text(language, "alarm"), a.Name),
		Body:  strings.TrimPrefix(body, " · "),
		Tag:   fmt.Sprintf("alarm-%d", a.ID),
		URL:   "./",
	}
}

func serviceNotification(language string, m rega.ServiceMessage) Notification {
	what := text(language, m.Type)
	if m.Type == "ERROR_CODE" && m.Value != "" {
		what += " " + m.Value
	}
	body := m.Name + ": " + what
	if m.RoomName != "" {
		body += " · " + m.RoomName
	}
	return Notification{Title: text(language, "title"), Body: body, Tag: fmt.Sprintf("service-%d", m.ID), URL: "./"}
}

// Poll looks for new alarms and service messages once.
func (n *Notifier) Poll() {
	alarms, err := n.messages.GetAlarmMessages()
	if err != nil {
		logger.Error("Push: reading alarms failed:", err)
		return
	}
	service, err := n.messages.GetServiceMessages()
	if err != nil {
		logger.Error("Push: reading service messages failed:", err)
		return
	}
	n.mu.Lock()
	seen := map[string]bool{}
	var newAlarms []rega.AlarmMessage
	var newService []rega.ServiceMessage
	for _, a := range alarms {
		// Triggered again: a higher counter
		key := fmt.Sprintf("a:%d:%d", a.ID, a.Counter)
		seen[key] = true
		if n.primed && !n.seen[key] {
			newAlarms = append(newAlarms, a)
		}
	}
	for _, m := range service {
		key := fmt.Sprintf("s:%d:%s", m.ID, m.Timestamp)
		seen[key] = true
		if n.primed && !n.seen[key] {
			newService = append(newService, m)
		}
	}
	n.seen, n.primed = seen, true
	n.mu.Unlock()

	for _, entry := range n.store.All() {
		if entry.Alarms {
			for _, a := range newAlarms {
				n.deliver(entry, alarmNotification(entry.Language, a))
			}
		}
		if entry.Service {
			for _, m := range newService {
				n.deliver(entry, serviceNotification(entry.Language, m))
			}
		}
	}
}

func (n *Notifier) deliver(entry Entry, notification Notification) {
	payload, _ := json.Marshal(notification)
	err := n.vapid.Send(n.client, entry.Subscription, payload)
	if errors.Is(err, ErrGone) {
		_, _ = n.store.Remove(entry.Subscription.Endpoint)
		logger.Info("Push: dropped an expired subscription of " + entry.Device)
		return
	}
	if err != nil {
		host := entry.Subscription.Endpoint
		if u, perr := url.Parse(host); perr == nil {
			host = u.Host
		}
		logger.Error("Push: sending to "+host+" failed:", err)
	}
}

// NotifyRule tells the devices that receive rules that a rule's conditions
// hold.
func (n *Notifier) NotifyRule(id, name, message string) {
	notification := Notification{Title: name, Body: message, Tag: "rule-" + id, URL: "./"}
	for _, entry := range n.store.All() {
		if entry.Rules {
			n.deliver(entry, notification)
		}
	}
}

// Test sends a test notification to one subscription.
func (n *Notifier) Test(endpoint, title, body string) error {
	entry, ok := n.store.Get(endpoint)
	if !ok {
		return fmt.Errorf("not subscribed")
	}
	payload, _ := json.Marshal(Notification{Title: title, Body: body, Tag: "test", URL: "./"})
	return n.vapid.Send(n.client, entry.Subscription, payload)
}

// Run polls until the context ends.
func (n *Notifier) Run(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	n.Poll()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			n.Poll()
		}
	}
}
