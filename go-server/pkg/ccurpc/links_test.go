package ccurpc

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGetLinksDeduplicatesAndUsesGroupFlag(t *testing.T) {
	calls := map[string]int{}
	ccu := fakeInterface(t, map[string]string{
		"getLinks": `<array><data>
			<value><struct><member><name>SENDER</name><value>A:1</value></member><member><name>RECEIVER</name><value>A:2</value></member><member><name>NAME</name><value>intern</value></member></struct></value>
			<value><struct><member><name>SENDER</name><value>A:1</value></member><member><name>RECEIVER</name><value>A:2</value></member></struct></value>
			<value><struct><member><name>SENDER</name><value>B:1</value></member><member><name>RECEIVER</name><value>A:2</value></member></struct></value>
		</data></array>`,
	}, calls)
	defer ccu.Close()
	client := newTestClient(t, ccu.URL)

	links, err := client.GetLinks("HmIP-RF", "A")
	if err != nil {
		t.Fatal(err)
	}
	if len(links) != 2 || links[0].Name != "intern" || links[1].Sender != "B:1" {
		t.Fatalf("unexpected links: %+v", links)
	}
}

func TestLinkAddressesAreValidated(t *testing.T) {
	client := newClient(map[string]caller{})
	if err := client.AddLink("HmIP-RF", "A", "B:1", "", ""); err != ErrInvalidAddress {
		t.Errorf("a device is no link partner: %v", err)
	}
	if err := client.RemoveLink("HmIP-RF", "A:1", "B 1"); err != ErrInvalidAddress {
		t.Errorf("expected ErrInvalidAddress, got %v", err)
	}
	if _, err := client.GetLinkParamset("HmIP-RF", "A:1", "x</value>"); err != ErrInvalidAddress {
		t.Errorf("expected ErrInvalidAddress, got %v", err)
	}
}

func TestLinkParamsetDescriptionFallsBackToLink(t *testing.T) {
	keys := []string{}
	ccu := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "text/xml")
		if strings.Contains(string(body), "<value>LINK</value>") || strings.Contains(string(body), "<string>LINK</string>") {
			keys = append(keys, "LINK")
			_, _ = io.WriteString(w, xmlResponse(`<struct><member><name>SHORT_ON_LEVEL</name><value><struct>
				<member><name>TYPE</name><value>FLOAT</value></member>
				<member><name>OPERATIONS</name><value><i4>3</i4></value></member>
			</struct></value></member></struct>`))
			return
		}
		keys = append(keys, "partner")
		// The interface refuses the partner as paramset key
		_, _ = io.WriteString(w, `<?xml version="1.0"?><methodResponse><fault><value><struct>
			<member><name>faultCode</name><value><i4>-3</i4></value></member>
			<member><name>faultString</name><value>Unknown paramset</value></member>
		</struct></value></fault></methodResponse>`)
	}))
	defer ccu.Close()
	client := newTestClient(t, ccu.URL)

	description, err := client.GetLinkParamsetDescription("HmIP-RF", "A:2", "B:1")
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := description["SHORT_ON_LEVEL"]; !ok || strings.Join(keys, ",") != "partner,LINK" {
		t.Fatalf("description %+v after %v", description, keys)
	}
}
