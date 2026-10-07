package ccurpc

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// Through lite-rpc a call goes to /api/rpc/v1/xmlrpc/{interface} with the
// add-on's token, or with a user's session (WithToken); both share the
// descriptions
func TestProxy(t *testing.T) {
	var mu sync.Mutex
	var seen []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mu.Lock()
		seen = append(seen, r.URL.Path+" "+r.Header.Get("Authorization"))
		mu.Unlock()
		w.Header().Set("Content-Type", "text/xml")
		if strings.Contains(string(body), "listDevices") {
			_, _ = io.WriteString(w, `<?xml version="1.0" encoding="UTF-8"?><methodResponse><params><param><value><array><data>`+
				`<value><struct><member><name>ADDRESS</name><value>LEQ0000001</value></member><member><name>TYPE</name><value>HM-LC-Sw1-FM</value></member></struct></value>`+
				`</data></array></value></param></params></methodResponse>`)
			return
		}
		_, _ = io.WriteString(w, `<?xml version="1.0" encoding="UTF-8"?><methodResponse><params><param><value><string></string></value></param></params></methodResponse>`)
	}))
	defer server.Close()

	c := NewProxy(server.URL, []string{"BidCos-RF", "HmIP-RF"}, func() string { return "olt_addon" })
	if _, err := c.ListDevices("BidCos-RF"); err != nil {
		t.Fatal(err)
	}
	user := c.WithToken("SESSIONOFANNA")
	if _, err := user.CallRaw("BidCos-RF", "setValue", "LEQ0000001:1", "STATE", true); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(seen, "\n"); got != "/api/rpc/v1/xmlrpc/BidCos-RF Bearer olt_addon\n/api/rpc/v1/xmlrpc/BidCos-RF Bearer SESSIONOFANNA" {
		t.Fatalf("calls:\n%s", got)
	}
	// The user's client knows what the add-on's read
	if d, err := user.GetDeviceDescription("BidCos-RF", "LEQ0000001"); err != nil || d.Type != "HM-LC-Sw1-FM" {
		t.Fatalf("shared description: %+v %v", d, err)
	}
	if len(seen) != 2 {
		t.Fatalf("the description was read again: %v", seen)
	}
	if names := user.InterfaceNames(); len(names) != 2 {
		t.Fatalf("interfaces %v", names)
	}
}
