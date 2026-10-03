package rega

import "testing"

func TestSetLayoutValidates(t *testing.T) {
	c := &Client{}
	for _, layout := range []string{`{"a":"^"}`, `{not json`, string(make([]byte, 30001))} {
		if _, _, err := c.SetLayout(1, layout); err == nil {
			t.Errorf("%.20q: expected an error", layout)
		}
	}
}
