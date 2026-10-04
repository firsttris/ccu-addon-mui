package websocket

import (
	"net"
	"net/http"
	"strings"
)

// clientAddress is the address of the browser, for the login lockout. On
// the CCU the server only sees lighttpd (127.0.0.1); lighttpd's mod_proxy
// appends the real client to X-Forwarded-For, so the last entry is the one
// to trust; earlier entries come from the client and can be made up.
func clientAddress(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
		if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
			parts := strings.Split(forwarded, ",")
			if last := strings.TrimSpace(parts[len(parts)-1]); last != "" {
				return last
			}
		}
	}
	return host
}
