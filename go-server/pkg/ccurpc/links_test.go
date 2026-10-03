package ccurpc

import "testing"

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
