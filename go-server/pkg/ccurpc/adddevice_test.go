package ccurpc

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAddDeviceKeyMismatch(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "text/xml")
		_, _ = io.WriteString(w, `<?xml version="1.0"?><methodResponse><fault><value><struct><member><name>faultCode</name><value><i4>-7</i4></value></member><member><name>faultString</name><value>key mismatch</value></member></struct></value></fault></methodResponse>`)
	}))
	defer server.Close()
	client := newTestClient(t, server.URL)
	if err := client.AddDevice("HmIP-RF", "KEQ0000001"); !errors.Is(err, ErrKeyMismatch) {
		t.Fatalf("got %v (%T)", err, errors.Unwrap(err))
	}
}
