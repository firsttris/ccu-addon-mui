package websocket

import (
	"net/http/httptest"
	"testing"
)

func TestClientAddress(t *testing.T) {
	cases := []struct {
		remote, forwarded, want string
	}{
		// Behind lighttpd: its own entry is the last one
		{"127.0.0.1:41234", "192.168.178.20", "192.168.178.20"},
		{"127.0.0.1:41234", "10.0.0.1, 192.168.178.20", "192.168.178.20"},
		{"[::1]:41234", "192.168.178.20", "192.168.178.20"},
		// Directly connected clients can't choose their address
		{"192.168.178.30:5555", "10.0.0.1", "192.168.178.30"},
		{"127.0.0.1:41234", "", "127.0.0.1"},
	}
	for _, c := range cases {
		r := httptest.NewRequest("GET", "/ws/mui", nil)
		r.RemoteAddr = c.remote
		if c.forwarded != "" {
			r.Header.Set("X-Forwarded-For", c.forwarded)
		}
		if got := clientAddress(r); got != c.want {
			t.Errorf("clientAddress(%q, %q) = %q, want %q", c.remote, c.forwarded, got, c.want)
		}
	}
}
