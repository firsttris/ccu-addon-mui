package ccurpc

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"ccu-addon-mui-server/pkg/latin1"
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
	return newClient(map[string]caller{"HmIP-RF": newHTTPCaller(url, &untypedValueTransport{base: http.DefaultTransport})})
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

	// Cached: neither the channel, its device (for the firmware) nor the
	// paramset description is loaded again
	if _, err := client.GetParamsetDescription("HmIP-RF", "0001D3C99C3C93:1", ParamsetValues); err != nil {
		t.Fatal(err)
	}
	if calls["getDeviceDescription"] != 2 || calls["getParamsetDescription"] != 1 {
		t.Fatalf("expected the channel, its device and the description once, got %v", calls)
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
			<value><struct><member><name>ADDRESS</name><value>A</value></member><member><name>TYPE</name><value>HmIP-BSM</value></member><member><name>VERSION</name><value><i4>12</i4></value></member></struct></value>
			<value><struct><member><name>ADDRESS</name><value>B</value></member><member><name>TYPE</name><value>HmIP-BSM</value></member><member><name>VERSION</name><value><i4>12</i4></value></member></struct></value>
			<value><struct><member><name>ADDRESS</name><value>A:1</value></member><member><name>TYPE</name><value>SWITCH_VIRTUAL_RECEIVER</value></member><member><name>PARENT_TYPE</name><value>HmIP-BSM</value></member><member><name>VERSION</name><value><i4>12</i4></value></member></struct></value>
			<value><struct><member><name>ADDRESS</name><value>B:1</value></member><member><name>TYPE</name><value>SWITCH_VIRTUAL_RECEIVER</value></member><member><name>PARENT_TYPE</name><value>HmIP-BSM</value></member><member><name>VERSION</name><value><i4>12</i4></value></member></struct></value>
		</data></array>`,
		"getParamsetDescription": valuesDescription,
	}, calls)
	defer ccu.Close()
	client := newTestClient(t, ccu.URL)

	devices, err := client.ListDevices("HmIP-RF")
	if err != nil || len(devices) != 4 {
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

// Devices of a type with different firmware don't share descriptions
func TestFirmwareSeparatesParamsetDescriptions(t *testing.T) {
	calls := map[string]int{}
	device := func(address, firmware string) string {
		return `<value><struct><member><name>ADDRESS</name><value>` + address + `</value></member><member><name>TYPE</name><value>HmIP-BSM</value></member><member><name>FIRMWARE</name><value>` + firmware + `</value></member><member><name>VERSION</name><value><i4>12</i4></value></member></struct></value>` +
			`<value><struct><member><name>ADDRESS</name><value>` + address + `:1</value></member><member><name>TYPE</name><value>SWITCH_VIRTUAL_RECEIVER</value></member><member><name>PARENT_TYPE</name><value>HmIP-BSM</value></member><member><name>VERSION</name><value><i4>12</i4></value></member></struct></value>`
	}
	ccu := fakeInterface(t, map[string]string{
		"listDevices":            `<array><data>` + device("A", "1.0.0") + device("B", "1.4.2") + device("C", "1.4.2") + `</data></array>`,
		"getParamsetDescription": valuesDescription,
	}, calls)
	defer ccu.Close()
	client := newTestClient(t, ccu.URL)
	if _, err := client.ListDevices("HmIP-RF"); err != nil {
		t.Fatal(err)
	}
	for _, address := range []string{"A:1", "B:1", "C:1"} {
		if _, err := client.GetParamsetDescription("HmIP-RF", address, ParamsetValues); err != nil {
			t.Fatal(err)
		}
	}
	if calls["getParamsetDescription"] != 2 {
		t.Fatalf("expected one description per firmware, got %v", calls)
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

// Calls go out in ISO-8859-1, as from libXmlRpc, and answers in it are read
func TestCallsUseLatin1(t *testing.T) {
	var got []byte
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got, _ = io.ReadAll(r.Body)
		_, _ = io.WriteString(w, xmlResponse("<string>B\xfcro</string>"))
	}))
	defer ts.Close()
	c := newClient(map[string]caller{"HmIP-RF": newHTTPCaller(ts.URL, &latin1Transport{base: &untypedValueTransport{base: http.DefaultTransport}})})

	if err := c.SetMetadata("HmIP-RF", "0001D3C99C3C93:1", "name", "Küche & Bad"); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(string(got), `<?xml version="1.0" encoding="iso-8859-1"?>`) || !strings.Contains(string(got), "<string>K\xfcche &amp; Bad</string>") {
		t.Fatalf("unexpected call: %q", got)
	}

	var reply string
	if err := c.call("HmIP-RF", "getMetadata", []any{"0001D3C99C3C93:1", "name"}, &reply); err != nil || reply != "Büro" {
		t.Fatalf("getMetadata = %q, %v", reply, err)
	}

	got = nil
	if err := c.SetMetadata("HmIP-RF", "0001D3C99C3C93:1", "name", "5 €"); !errors.Is(err, latin1.ErrNotLatin1) || got != nil {
		t.Fatalf("SetMetadata with € = %v, sent %q", err, got)
	}
}

// A slow call doesn't hold up others to the same interface
func TestCallsRunConcurrently(t *testing.T) {
	release := make(chan struct{})
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if strings.Contains(string(body), "SLOW") {
			<-release
		}
		_, _ = io.WriteString(w, xmlResponse("<struct></struct>"))
	}))
	defer ts.Close()
	defer close(release)
	c := newTestClient(t, ts.URL)

	go func() { _, _ = c.GetParamset("HmIP-RF", "SLOW:1", ParamsetValues) }()
	time.Sleep(50 * time.Millisecond)
	done := make(chan error, 1)
	go func() {
		_, err := c.GetParamset("HmIP-RF", "FAST:1", ParamsetValues)
		done <- err
	}()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("the second call waited for the first")
	}
}

// Faults keep their code
func TestCallFault(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `<?xml version="1.0"?><methodResponse><fault><value><struct>`+
			`<member><name>faultCode</name><value><i4>-7</i4></value></member>`+
			`<member><name>faultString</name><value>no device</value></member></struct></value></fault></methodResponse>`)
	}))
	defer ts.Close()
	c := newTestClient(t, ts.URL)
	_, err := c.GetParamset("HmIP-RF", "A:1", ParamsetValues)
	if faultCode(err) != -7 {
		t.Fatalf("fault code of %v", err)
	}
}

// After a firmware update (Forget) the device is read again, so the new
// firmware gets descriptions of its own
func TestParamsetDescriptionAfterFirmwareUpdate(t *testing.T) {
	calls := map[string]int{}
	firmware := "1.0.0"
	ccu := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		value := `<struct><member><name>ADDRESS</name><value>A</value></member><member><name>TYPE</name><value>HmIP-BSM</value></member><member><name>FIRMWARE</name><value>` + firmware + `</value></member><member><name>VERSION</name><value><i4>12</i4></value></member></struct>`
		switch {
		case strings.Contains(string(body), "getParamsetDescription"):
			calls["getParamsetDescription"]++
			value = valuesDescription
		case strings.Contains(string(body), "A:1"):
			value = `<struct><member><name>ADDRESS</name><value>A:1</value></member><member><name>TYPE</name><value>SWITCH_VIRTUAL_RECEIVER</value></member><member><name>PARENT_TYPE</name><value>HmIP-BSM</value></member><member><name>VERSION</name><value><i4>12</i4></value></member></struct>`
		}
		w.Header().Set("Content-Type", "text/xml")
		_, _ = io.WriteString(w, xmlResponse(value))
	}))
	defer ccu.Close()
	client := newTestClient(t, ccu.URL)

	for _, version := range []string{"1.0.0", "1.2.0", "1.4.0"} {
		firmware = version
		client.Forget("HmIP-RF", "A")
		if _, err := client.GetParamsetDescription("HmIP-RF", "A:1", ParamsetValues); err != nil {
			t.Fatal(err)
		}
	}
	if calls["getParamsetDescription"] != 3 {
		t.Fatalf("expected a description per firmware, got %v", calls)
	}
}

// hmipserver sends MIN, MAX and DEFAULT of its virtual devices untyped, read
// as text (openccu-lite's heating groups): numbers for FLOAT and INTEGER
func TestParamsetDescriptionNumbersFromText(t *testing.T) {
	description := parseParamsetDescription(map[string]any{
		"SET_TEMPERATURE": map[string]any{"TYPE": "FLOAT", "MIN": "4.5", "MAX": "30.5", "DEFAULT": "20.0",
			"SPECIAL": []any{map[string]any{"ID": "OFF", "VALUE": "4.5"}}},
		"BOOST_TIME": map[string]any{"TYPE": "INTEGER", "MIN": "0", "MAX": "30", "DEFAULT": 5},
		"NAME":       map[string]any{"TYPE": "STRING", "DEFAULT": "12"},
	})
	temperature := description["SET_TEMPERATURE"]
	if temperature.Min != 4.5 || temperature.Max != 30.5 || temperature.Default != 20.0 || temperature.Special[0].Value != 4.5 {
		t.Fatalf("FLOAT: %+v", temperature)
	}
	if boost := description["BOOST_TIME"]; boost.Min != 0 || boost.Max != 30 || boost.Default != 5 {
		t.Fatalf("INTEGER: %+v", boost)
	}
	if name := description["NAME"]; name.Default != "12" {
		t.Fatalf("STRING stays text: %+v", name)
	}
}

// Values that come untyped, as text, get the type of their parameter
// (hmipserver's virtual devices on openccu-lite); typed values ask for no
// description
func TestGetParamsetTypesUntypedValues(t *testing.T) {
	calls := map[string]int{}
	ccu := fakeInterface(t, map[string]string{
		"getDeviceDescription":   channelDescription,
		"getParamsetDescription": valuesDescription,
		"getParamset": `<struct>
			<member><name>STATE</name><value>1</value></member>
			<member><name>ON_TIME</name><value>17.5</value></member>
			<member><name>PROCESS</name><value><i4>0</i4></value></member>
		</struct>`,
	}, calls)
	defer ccu.Close()
	client := newTestClient(t, ccu.URL)

	values, err := client.GetParamset("HmIP-RF", "0001D3C99C3C93:1", ParamsetValues)
	if err != nil {
		t.Fatal(err)
	}
	if values["STATE"] != true || values["ON_TIME"] != 17.5 || fmt.Sprint(values["PROCESS"]) != "0" {
		t.Fatalf("values: %#v", values)
	}
	if calls["getParamsetDescription"] != 1 {
		t.Fatalf("calls: %v", calls)
	}
}
