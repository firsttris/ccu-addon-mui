package fakeccu

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"testing"

	"ccu-addon-mui-server/pkg/rega"
)

// Every script of the add-on must be understood, or a new script would
// silently break all tests that run against the fake CCU.
func TestRecognisesAllScripts(t *testing.T) {
	ccu := New(&Fixture{Users: []User{{Name: "Admin", Level: 8}}})
	values := map[string]string{
		"OBJECT_ID": "ALL", "USERNAME": "Admin", "INTERFACE": "HmIP-RF", "ADDRESS": "A:1",
		"DEVICE_ADDRESS": "A", "ATTRIBUTE": "STATE", "VALUE": "true",
		"NAME": "Neu", "GROUP_ID": "1", "CHANNEL_ID": "2", "ACTION": "Add", "ID": "950",
		"LIST_ID": "ID_ROOMS", "ENUM_TYPE": "etRoom", "OBJECT_TYPE": "OT_VARDP", "VALUE_TYPE": "4",
		"SUB_TYPE": "0", "UNIT": "°C", "MIN": "0", "MAX": "40", "FALSE_NAME": "", "TRUE_NAME": "",
		"VALUE_LIST": "", "INITIAL": "0", "ITEM_ID": "0", "TILE": "light",
	}
	placeholder := regexp.MustCompile(`\{\{([A-Z_]+)\}\}`)
	for name, template := range rega.Scripts() {
		script := placeholder.ReplaceAllStringFunc(template, func(m string) string {
			value, ok := values[strings.Trim(m, "{}")]
			if !ok {
				t.Fatalf("%s: no test value for %s", name, m)
			}
			return value
		})
		if _, err := ccu.runScript(script); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func TestXMLRPCCodecRoundTrip(t *testing.T) {
	call := encodeCall("putParamset", "A:1", "MASTER", map[string]interface{}{
		"NAME": "a <b>", "ON": true, "LEVEL": 0.25, "COUNT": 3, "LIST": []interface{}{"x", 1},
	})
	method, params, err := decodeCall(strings.NewReader(call))
	if err != nil || method != "putParamset" || len(params) != 3 {
		t.Fatalf("decodeCall = %q, %v, %v", method, params, err)
	}
	values := params[2].(map[string]interface{})
	if values["NAME"] != "a <b>" || values["ON"] != true || values["LEVEL"] != 0.25 || values["COUNT"] != 3 {
		t.Fatalf("unexpected values: %#v", values)
	}
	if list := values["LIST"].([]interface{}); len(list) != 2 || list[1] != 1 {
		t.Fatalf("unexpected list: %#v", values["LIST"])
	}
}

func TestControlEndpoints(t *testing.T) {
	fixture, err := LoadFixture("../../../fixtures/demo-ccu.json")
	if err != nil {
		t.Fatal(err)
	}
	ccu := New(fixture)
	if err := ccu.Start("127.0.0.1"); err != nil {
		t.Fatal(err)
	}
	defer ccu.Close()
	base := fmt.Sprintf("http://127.0.0.1:%d", ccu.WebUIPort)

	resp, err := http.Post(base+"/fake/set", "application/json",
		strings.NewReader(`{"interface":"BidCos-RF","address":"LEQ0000001:1","datapoint":"STATE","value":true}`))
	if err != nil || resp.StatusCode != http.StatusNoContent {
		t.Fatalf("set: %v %v", resp, err)
	}
	if !strings.Contains(ccu.getChannels("1"), "D\tSTATE\t2\ttrue") {
		t.Fatal("value not set")
	}

	resp, err = http.Post(base+"/fake/reset", "", nil)
	if err != nil || resp.StatusCode != http.StatusNoContent {
		t.Fatalf("reset: %v %v", resp, err)
	}
	if !strings.Contains(ccu.getChannels("1"), "D\tSTATE\t2\tfalse") {
		t.Fatal("value not reset")
	}

	resp, _ = http.Post(base+"/fake/set", "application/json", strings.NewReader(`{"interface":"X","address":"Y","datapoint":"Z"}`))
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for an unknown channel, got %d", resp.StatusCode)
	}
}
