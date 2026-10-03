package ccurpc

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kolo/xmlrpc"
)

// xmlResponse wraps a value as XML-RPC response, as the CCU sends it.
func xmlResponse(value string) string {
	return `<?xml version="1.0" encoding="ISO-8859-1"?><methodResponse><params><param><value>` + value + `</value></param></params></methodResponse>`
}

// fakeInterface answers XML-RPC calls with canned responses per method and
// counts the calls.
func fakeInterface(t *testing.T, responses map[string]string, calls map[string]int) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		start := strings.Index(string(body), "<methodName>") + len("<methodName>")
		end := strings.Index(string(body), "</methodName>")
		method := string(body)[start:end]
		calls[method]++
		response, ok := responses[method]
		if !ok {
			t.Errorf("unexpected call %s", method)
		}
		w.Header().Set("Content-Type", "text/xml")
		_, _ = io.WriteString(w, xmlResponse(response))
	}))
}

func newTestClient(t *testing.T, url string) *Client {
	rpc, err := xmlrpc.NewClient(url, &untypedValueTransport{base: http.DefaultTransport})
	if err != nil {
		t.Fatal(err)
	}
	return newClient(map[string]caller{"HmIP-RF": rpc})
}

const channelDescription = `<struct>
<member><name>ADDRESS</name><value>0001D3C99C3C93:1</value></member>
<member><name>TYPE</name><value>SWITCH_VIRTUAL_RECEIVER</value></member>
<member><name>PARENT</name><value>0001D3C99C3C93</value></member>
<member><name>PARENT_TYPE</name><value>HmIP-BSM</value></member>
<member><name>INDEX</name><value><i4>1</i4></value></member>
<member><name>VERSION</name><value><i4>12</i4></value></member>
<member><name>FLAGS</name><value><i4>1</i4></value></member>
<member><name>PARAMSETS</name><value><array><data><value>MASTER</value><value>VALUES</value></data></array></value></member>
<member><name>LINK_TARGET_ROLES</name><value>SWITCH  WINMATIC</value></member>
</struct>`

const valuesDescription = `<struct>
<member><name>STATE</name><value><struct>
  <member><name>TYPE</name><value>BOOL</value></member>
  <member><name>OPERATIONS</name><value><i4>7</i4></value></member>
  <member><name>FLAGS</name><value><i4>1</i4></value></member>
  <member><name>DEFAULT</name><value><boolean>0</boolean></value></member>
  <member><name>MIN</name><value><boolean>0</boolean></value></member>
  <member><name>MAX</name><value><boolean>1</boolean></value></member>
  <member><name>CONTROL</name><value>SWITCH.STATE</value></member>
</struct></value></member>
<member><name>ON_TIME</name><value><struct>
  <member><name>TYPE</name><value>FLOAT</value></member>
  <member><name>OPERATIONS</name><value><i4>2</i4></value></member>
  <member><name>MIN</name><value><double>0.000000</double></value></member>
  <member><name>MAX</name><value><double>8580000.000000</double></value></member>
  <member><name>UNIT</name><value>s</value></member>
  <member><name>SPECIAL</name><value><array><data><value><struct>
    <member><name>ID</name><value>NOT_USED</value></member>
    <member><name>VALUE</name><value><double>0.000000</double></value></member>
  </struct></value></data></array></value></member>
</struct></value></member>
<member><name>PROCESS</name><value><struct>
  <member><name>TYPE</name><value>ENUM</value></member>
  <member><name>OPERATIONS</name><value><i4>5</i4></value></member>
  <member><name>VALUE_LIST</name><value><array><data><value>STABLE</value><value>NOT_STABLE</value></data></array></value></member>
</struct></value></member>
</struct>`

func TestGetParamsetDescriptionParsesAndCachesPerDeviceType(t *testing.T) {
	calls := map[string]int{}
	ccu := fakeInterface(t, map[string]string{
		"getDeviceDescription":   channelDescription,
		"getParamsetDescription": valuesDescription,
	}, calls)
	defer ccu.Close()
	client := newTestClient(t, ccu.URL)

	description, err := client.GetParamsetDescription("HmIP-RF", "0001D3C99C3C93:1", ParamsetValues)
	if err != nil {
		t.Fatal(err)
	}

	state := description["STATE"]
	if state.Type != "BOOL" || state.Operations != OperationRead|OperationWrite|OperationEvent || state.Max != true || state.Control != "SWITCH.STATE" {
		t.Fatalf("unexpected STATE: %+v", state)
	}
	onTime := description["ON_TIME"]
	if onTime.Unit != "s" || onTime.Max != 8580000.0 || len(onTime.Special) != 1 || onTime.Special[0].ID != "NOT_USED" {
		t.Fatalf("unexpected ON_TIME: %+v", onTime)
	}
	if got := description["PROCESS"].ValueList; len(got) != 2 || got[1] != "NOT_STABLE" {
		t.Fatalf("unexpected PROCESS value list: %v", got)
	}

	// Cached: neither the device nor the paramset description is loaded again
	if _, err := client.GetParamsetDescription("HmIP-RF", "0001D3C99C3C93:1", ParamsetValues); err != nil {
		t.Fatal(err)
	}
	if calls["getDeviceDescription"] != 1 || calls["getParamsetDescription"] != 1 {
		t.Fatalf("expected one call each, got %v", calls)
	}
}

func TestGetDeviceDescriptionParsesFields(t *testing.T) {
	ccu := fakeInterface(t, map[string]string{"getDeviceDescription": channelDescription}, map[string]int{})
	defer ccu.Close()
	client := newTestClient(t, ccu.URL)

	device, err := client.GetDeviceDescription("HmIP-RF", "0001D3C99C3C93:1")
	if err != nil {
		t.Fatal(err)
	}
	if device.ParentType != "HmIP-BSM" || device.Index != 1 || device.Version != 12 ||
		len(device.Paramsets) != 2 || len(device.LinkTarget) != 2 || device.LinkTarget[1] != "WINMATIC" {
		t.Fatalf("unexpected device: %+v", device)
	}
}

func TestSameDeviceTypeSharesParamsetDescriptions(t *testing.T) {
	calls := map[string]int{}
	ccu := fakeInterface(t, map[string]string{
		"listDevices": `<array><data>
			<value><struct><member><name>ADDRESS</name><value>A:1</value></member><member><name>TYPE</name><value>SWITCH_VIRTUAL_RECEIVER</value></member><member><name>PARENT_TYPE</name><value>HmIP-BSM</value></member><member><name>VERSION</name><value><i4>12</i4></value></member></struct></value>
			<value><struct><member><name>ADDRESS</name><value>B:1</value></member><member><name>TYPE</name><value>SWITCH_VIRTUAL_RECEIVER</value></member><member><name>PARENT_TYPE</name><value>HmIP-BSM</value></member><member><name>VERSION</name><value><i4>12</i4></value></member></struct></value>
		</data></array>`,
		"getParamsetDescription": valuesDescription,
	}, calls)
	defer ccu.Close()
	client := newTestClient(t, ccu.URL)

	devices, err := client.ListDevices("HmIP-RF")
	if err != nil || len(devices) != 2 {
		t.Fatalf("ListDevices = %v, %v", devices, err)
	}
	for _, address := range []string{"A:1", "B:1"} {
		if _, err := client.GetParamsetDescription("HmIP-RF", address, ParamsetValues); err != nil {
			t.Fatal(err)
		}
	}
	if calls["getParamsetDescription"] != 1 || calls["getDeviceDescription"] != 0 {
		t.Fatalf("expected one description for both devices, got %v", calls)
	}
}

func TestValidation(t *testing.T) {
	client := newClient(map[string]caller{})
	if _, err := client.GetParamset("HmIP-RF", "A:1", ParamsetValues); err != ErrUnknownInterface && !strings.Contains(err.Error(), "unknown interface") {
		t.Fatalf("expected unknown interface, got %v", err)
	}
	for _, address := range []string{"", "A:1:2", "A B", "x<y>"} {
		if _, err := client.GetParamset("HmIP-RF", address, ParamsetValues); err != ErrInvalidAddress {
			t.Errorf("address %q: expected ErrInvalidAddress, got %v", address, err)
		}
	}
	if _, err := client.GetParamset("HmIP-RF", "A:1", "LINK"); err != ErrInvalidParamset {
		t.Errorf("expected ErrInvalidParamset, got %v", err)
	}
}

func TestForgetDropsDeviceAndChannels(t *testing.T) {
	client := newClient(map[string]caller{})
	for _, address := range []string{"A", "A:1", "AB:1"} {
		client.devices["HmIP-RF|"+address] = DeviceDescription{Address: address}
	}
	client.Forget("HmIP-RF", "A")
	if len(client.devices) != 1 {
		t.Fatalf("expected only AB:1 to remain, got %v", client.devices)
	}
}

func TestGetParamsetReturnsValues(t *testing.T) {
	ccu := fakeInterface(t, map[string]string{
		"getParamset": `<struct><member><name>STATE</name><value><boolean>1</boolean></value></member><member><name>LEVEL</name><value><double>0.5</double></value></member></struct>`,
	}, map[string]int{})
	defer ccu.Close()
	client := newTestClient(t, ccu.URL)

	values, err := client.GetParamset("HmIP-RF", "A:1", ParamsetValues)
	if err != nil || values["STATE"] != true || values["LEVEL"] != 0.5 {
		t.Fatalf("GetParamset = %v, %v", values, err)
	}
}
