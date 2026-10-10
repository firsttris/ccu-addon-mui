package ccurpc

import (
	"strings"
	"testing"
)

var masterDescription = ParamsetDescription{
	"POWERUP_JUMPTARGET": {Type: "ENUM", Operations: 3, ValueList: []string{"OFF", "ON_DELAY", "ON"}, Min: 0, Max: 2},
	"TEMPERATURE_OFFSET": {Type: "FLOAT", Operations: 3, Min: -3.5, Max: 3.5},
	"BOOST_TIME":         {Type: "INTEGER", Operations: 3, Min: 0.0, Max: 30.0, Special: []SpecialValue{{ID: "NOT_USED", Value: 255.0}}},
	"LOCAL_RESET":        {Type: "BOOL", Operations: 3},
	"NAME":               {Type: "STRING", Operations: 3},
	"FIRMWARE":           {Type: "STRING", Operations: 1},
}

func TestCoerceValuesConvertsTypes(t *testing.T) {
	values, err := CoerceValues(masterDescription, map[string]any{
		"POWERUP_JUMPTARGET": 2.0,
		"TEMPERATURE_OFFSET": -1.5,
		"BOOST_TIME":         255.0, // special value outside the range
		"LOCAL_RESET":        true,
		"NAME":               "Bad",
	})
	if err != nil {
		t.Fatal(err)
	}
	if values["POWERUP_JUMPTARGET"] != 2 || values["TEMPERATURE_OFFSET"] != -1.5 || values["BOOST_TIME"] != 255 ||
		values["LOCAL_RESET"] != true || values["NAME"] != "Bad" {
		t.Fatalf("unexpected values: %#v", values)
	}
}

func TestCoerceValuesRejectsInvalidValues(t *testing.T) {
	for _, tc := range []struct {
		values map[string]any
		want   string
	}{
		{map[string]any{}, "no values"},
		{map[string]any{"UNKNOWN": 1.0}, "unknown parameter"},
		{map[string]any{"FIRMWARE": "x"}, "not writable"},
		{map[string]any{"POWERUP_JUMPTARGET": 3.0}, "not in the value list"},
		{map[string]any{"POWERUP_JUMPTARGET": 1.5}, "whole number"},
		{map[string]any{"TEMPERATURE_OFFSET": 4.0}, "above the maximum"},
		{map[string]any{"BOOST_TIME": -1.0}, "below the minimum"},
		{map[string]any{"LOCAL_RESET": "yes"}, "boolean"},
		{map[string]any{"NAME": 1.0}, "string"},
	} {
		if _, err := CoerceValues(masterDescription, tc.values); err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%v: expected %q, got %v", tc.values, tc.want, err)
		}
	}
}

func TestPutParamsetSendsTypedValues(t *testing.T) {
	calls := map[string]int{}
	ccu := fakeInterface(t, map[string]string{"putParamset": "<string></string>"}, calls)
	defer ccu.Close()
	client := newTestClient(t, ccu.URL)

	if err := client.PutParamset("HmIP-RF", "A:1", ParamsetMaster, map[string]any{"BOOST_TIME": 5}); err != nil {
		t.Fatal(err)
	}
	if calls["putParamset"] != 1 {
		t.Fatalf("expected one call, got %v", calls)
	}
	if err := client.PutParamset("HmIP-RF", "A:1", "LINK", nil); err != ErrInvalidParamset {
		t.Fatalf("expected ErrInvalidParamset, got %v", err)
	}
}
