//go:build !lite

// The alarms come from the ReGa: only a CCU has them (rega_ccu.go)

package websocket

import (
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/rega"
)

func TestAlarmWatchSendsChangesOnce(t *testing.T) {
	var reads atomic.Int32
	counter := atomic.Int32{}
	counter.Store(1)
	regaServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reads.Add(1)
		_, _ = io.WriteString(w, "A\t4711\ttrue\t"+strconv.Itoa(int(counter.Load()))+"\t2026-10-06 08:00:00\t2026-10-06 08:00:00\tA:1\tFlur\tAlarm\tRauchmelder\r\n")
	}))
	defer regaServer.Close()
	host, port, _ := net.SplitHostPort(regaServer.Listener.Addr().String())
	portNum, _ := strconv.Atoi(port)
	s := NewServer(nil, rega.NewClient(&config.Config{CCUHost: host, RegaPort: portNum}))

	watcher := &Client{send: make(chan []byte, 4), done: make(chan struct{}), alarms: true}
	other := &Client{send: make(chan []byte, 4), done: make(chan struct{})}
	s.clients[watcher], s.clients[other] = true, true

	s.pollAlarms()
	var m alarmMessagesMessage
	if err := json.Unmarshal(<-watcher.send, &m); err != nil || m.Type != "alarmMessages" || len(m.Alarms) != 1 || m.Alarms[0].ID != 4711 {
		t.Fatalf("unexpected message %+v (%v)", m, err)
	}
	if len(other.send) != 0 {
		t.Fatal("a connection that didn't load the alarms got them")
	}

	// The notifier takes the list just read instead of running the script
	before := reads.Load()
	if alarms, err := s.MessageSource(time.Minute).GetAlarmMessages(); err != nil || len(alarms) != 1 || reads.Load() != before {
		t.Fatalf("expected the cached alarms, got %v %v (%d reads)", alarms, err, reads.Load()-before)
	}

	// Unchanged: nothing sent; triggered again: sent
	s.messages.alarms.at = time.Time{}
	s.pollAlarms()
	if len(watcher.send) != 0 {
		t.Fatal("unchanged alarms sent again")
	}
	counter.Store(2)
	s.messages.alarms.at = time.Time{}
	s.pollAlarms()
	if len(watcher.send) != 1 {
		t.Fatal("changed alarms not sent")
	}
}
