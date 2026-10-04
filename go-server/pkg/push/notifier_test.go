package push

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"

	"ccu-addon-mui-server/pkg/rega"
)

type fakeMessages struct {
	alarms  []rega.AlarmMessage
	service []rega.ServiceMessage
}

func (f *fakeMessages) GetAlarmMessages() ([]rega.AlarmMessage, error)     { return f.alarms, nil }
func (f *fakeMessages) GetServiceMessages() ([]rega.ServiceMessage, error) { return f.service, nil }

func TestNotifierSendsOnlyNews(t *testing.T) {
	b := newBrowser(t)
	var mu sync.Mutex
	var got []Notification
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var n Notification
		_ = json.Unmarshal([]byte(b.decrypt(t, body)), &n)
		mu.Lock()
		got = append(got, n)
		mu.Unlock()
		w.WriteHeader(http.StatusCreated)
	}))
	defer server.Close()

	store, err := OpenStore(filepath.Join(t.TempDir(), "push.json"))
	if err != nil {
		t.Fatal(err)
	}
	vapid, _ := store.VAPID("mailto:test@example.com")
	_ = store.Put(Entry{Subscription: b.subscription(server.URL), Language: "en", Alarms: true, Service: true})

	messages := &fakeMessages{
		service: []rega.ServiceMessage{{ID: 1, Type: "LOW_BAT", Name: "Fensterkontakt Bad", Timestamp: "t1"}},
	}
	n := NewNotifier(store, vapid, messages)
	n.client = server.Client()

	n.Poll() // learns what is there
	if len(got) != 0 {
		t.Fatalf("first poll notified: %v", got)
	}
	messages.alarms = []rega.AlarmMessage{{ID: 958, Name: "Wasseralarm", Message: "Wasser erkannt", Counter: 1, RoomName: "Keller"}}
	messages.service = append(messages.service, rega.ServiceMessage{ID: 2, Type: "UNREACH", Name: "Wandthermostat", Timestamp: "t2"})
	n.Poll()
	n.Poll() // nothing new
	if len(got) != 2 {
		t.Fatalf("expected 2 notifications, got %+v", got)
	}
	if got[0].Title != "Alarm: Wasseralarm" || got[0].Body != "Wasser erkannt · Keller" {
		t.Errorf("alarm: %+v", got[0])
	}
	if got[1].Body != "Wandthermostat: unreachable" {
		t.Errorf("service: %+v", got[1])
	}

	// Triggered again
	messages.alarms[0].Counter = 2
	n.Poll()
	if len(got) != 3 {
		t.Fatalf("expected the alarm again, got %d", len(got))
	}

	// The key and subscriptions survive a restart
	again, _ := OpenStore(store.path)
	v2, _ := again.VAPID("mailto:test@example.com")
	if v2.PublicKey() != vapid.PublicKey() || len(again.All()) != 1 {
		t.Fatal("store not persisted")
	}
}

func TestServiceTextsFallBackToTheWebUI(t *testing.T) {
	cases := []struct{ language, key, want string }{
		{"de", "LOW_BAT", "Batterie schwach"},
		{"de", "EMERGENCY_OPERATION", "Verbindungsabbruch zum RBG"},
		{"en", "EMERGENCY_OPERATION", "Connection failure with room control unit"},
		{"de", "NO_SUCH_DATAPOINT", "NO_SUCH_DATAPOINT"},
	}
	for _, c := range cases {
		if got := text(c.language, c.key); got != c.want {
			t.Errorf("text(%q, %q) = %q, want %q", c.language, c.key, got, c.want)
		}
	}
}
