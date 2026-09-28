package rega

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestParseNamedObjects(t *testing.T) {
	output := "2117\tDach\r\n4657\tKinderzimmer \"Paul\" \\ 2\r\n6281\tZwei\r\nZeilen\r\n"

	got := parseNamedObjects(output)
	want := []NamedObject{
		{ID: 2117, Name: "Dach"},
		{ID: 4657, Name: `Kinderzimmer "Paul" \ 2`},
		{ID: 6281, Name: "Zwei\nZeilen"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseNamedObjects() = %+v, want %+v", got, want)
	}
}

func TestParseNamedObjectsEmpty(t *testing.T) {
	got := parseNamedObjects("")
	if got == nil || len(got) != 0 {
		t.Fatalf("expected empty non-nil slice, got %#v", got)
	}
	// Must serialise as [] rather than null for the frontend.
	b, _ := json.Marshal(got)
	if string(b) != "[]" {
		t.Fatalf("expected [], got %s", b)
	}
}

func TestParseChannels(t *testing.T) {
	output := "" +
		"C\t7047\tINT0000001:1\tHEATING_CLIMATECONTROL_TRANSCEIVER\tVirtualDevices\tBad \"EG\"\r\n" +
		"D\tACTUAL_TEMPERATURE\t4\t21.200000\r\n" +
		"D\tBOOST_MODE\t2\tfalse\r\n" +
		"D\tCONTROL_MODE\t16\t\r\n" +
		"D\tSET_POINT_MODE\t16\t1\r\n" +
		"D\tPARTY_TIME_END\t20\t2000_01_01 00:00\r\n" +
		"C\t4253\t002C9D899A7CE7:3\tSWITCH_VIRTUAL_RECEIVER\tHmIP-RF\tTab\tim Namen\r\n" +
		"D\tTEXT\t20\tZeile 1\r\n" +
		"Zeile 2\r\n"

	got := parseChannels(output)
	want := []Channel{
		{
			ID: 7047, Address: "INT0000001:1", Type: "HEATING_CLIMATECONTROL_TRANSCEIVER",
			InterfaceName: "VirtualDevices", Name: `Bad "EG"`,
			Datapoints: map[string]interface{}{
				"ACTUAL_TEMPERATURE": 21.2,
				"BOOST_MODE":         false,
				"CONTROL_MODE":       nil,
				"SET_POINT_MODE":     float64(1),
				"PARTY_TIME_END":     "2000_01_01 00:00",
			},
		},
		{
			ID: 4253, Address: "002C9D899A7CE7:3", Type: "SWITCH_VIRTUAL_RECEIVER",
			InterfaceName: "HmIP-RF", Name: "Tab\tim Namen",
			Datapoints: map[string]interface{}{"TEXT": "Zeile 1\nZeile 2"},
		},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseChannels() =\n%+v\nwant\n%+v", got, want)
	}
}

func TestParseChannelsIgnoresMalformedLines(t *testing.T) {
	output := "D\tSTATE\t2\ttrue\r\nC\tnot-a-number\tA:1\tX\tY\tZ\r\nC\t1\tA:1\r\n"
	if got := parseChannels(output); len(got) != 0 {
		t.Fatalf("expected no channels, got %+v", got)
	}
}
