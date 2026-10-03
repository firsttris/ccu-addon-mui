package fakeccu

import (
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
