package rega

import (
	"encoding/json"
	"reflect"
	"strings"
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

func TestParseChannelsStatus(t *testing.T) {
	output := "" +
		"C\t1\t000A9D89A7AF25:1\tHEATING_CLIMATECONTROL_TRANSCEIVER\tHmIP-RF\tFlur\r\n" +
		"S\t000A9D89A7AF25:0\tLOW_BAT\tfalse\r\n" +
		"S\t000A9D89A7AF25:0\tUNREACH\ttrue\r\n" +
		"D\tACTUAL_TEMPERATURE\t4\t0.000000\r\n" +
		"C\t2\tKEQ1063873:1\tKEYMATIC\tBidCos-RF\tTür\r\n" +
		"S\tKEQ1063873:0\tLOWBAT\ttrue\r\n" +
		"S\tKEQ1063873:0\tUNREACH\t\r\n" +
		"C\t3\tINT0000001:1\tSWITCH_VIRTUAL_RECEIVER\tVirtualDevices\tOhne Status\r\n"

	got := parseChannels(output)
	if len(got) != 3 {
		t.Fatalf("expected 3 channels, got %+v", got)
	}
	if got[0].StatusAddress != "000A9D89A7AF25:0" || !reflect.DeepEqual(got[0].Status, map[string]bool{"LOW_BAT": false, "UNREACH": true}) {
		t.Fatalf("unexpected status for HmIP channel: %q %+v", got[0].StatusAddress, got[0].Status)
	}
	if got[0].Datapoints["ACTUAL_TEMPERATURE"] != float64(0) {
		t.Fatalf("datapoints after status lines must still be parsed: %+v", got[0].Datapoints)
	}
	// LOWBAT (BidCos) is normalised; a value that was never set is left out
	if !reflect.DeepEqual(got[1].Status, map[string]bool{"LOW_BAT": true}) {
		t.Fatalf("unexpected status for BidCos channel: %+v", got[1].Status)
	}
	if got[2].Status != nil || got[2].StatusAddress != "" {
		t.Fatalf("expected no status for channel without maintenance channel: %+v", got[2])
	}
	b, _ := json.Marshal(got[2])
	if strings.Contains(string(b), "status") {
		t.Fatalf("status fields must be omitted when empty: %s", b)
	}
}

func TestParseChannelsStatusOncePerDevice(t *testing.T) {
	// get_channels.tcl writes the S lines with the device's first channel
	// only; the others refer to the maintenance channel with an A line
	output := "" +
		"C\t1\t0001D3C99C3C93:1\tSWITCH_VIRTUAL_RECEIVER\tHmIP-RF\tLicht\r\n" +
		"A\t0001D3C99C3C93:0\r\n" +
		"S\t0001D3C99C3C93:0\tUNREACH\tfalse\r\n" +
		"C\t2\t000A9D89A7AF25:1\tHEATING_CLIMATECONTROL_TRANSCEIVER\tHmIP-RF\tFlur\r\n" +
		"A\t000A9D89A7AF25:0\r\n" +
		"C\t3\t0001D3C99C3C93:2\tSWITCH_VIRTUAL_RECEIVER\tHmIP-RF\tLicht 2\r\n" +
		"A\t0001D3C99C3C93:0\r\n"

	got := parseChannels(output)
	if len(got) != 3 {
		t.Fatalf("expected 3 channels, got %+v", got)
	}
	for _, i := range []int{0, 2} {
		if got[i].StatusAddress != "0001D3C99C3C93:0" || !reflect.DeepEqual(got[i].Status, map[string]bool{"UNREACH": false}) {
			t.Fatalf("channel %d: unexpected status %q %+v", i, got[i].StatusAddress, got[i].Status)
		}
	}
	// A maintenance channel without battery or reachability isn't watched
	if got[1].StatusAddress != "" || got[1].Status != nil {
		t.Fatalf("expected no status: %+v", got[1])
	}
}

func TestParseDeviceProblems(t *testing.T) {
	output := "" +
		"P\t000A9D89A7AF25\tfalse\ttrue\t4658\tOG\tWandthermostat OG Flur, Anbau\r\n" +
		"P\t003660C9930AB6\ttrue\ttrue\t\t\tFensterkontakt Bad OG\r\n"

	got := parseDeviceProblems(output)
	want := []DeviceProblem{
		{Address: "000A9D89A7AF25", Name: "Wandthermostat OG Flur, Anbau", RoomID: 4658, RoomName: "OG", Unreach: true},
		{Address: "003660C9930AB6", Name: "Fensterkontakt Bad OG", LowBat: true, Unreach: true},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseDeviceProblems() =\n%+v\nwant\n%+v", got, want)
	}
}

func TestParseChannelsIgnoresMalformedLines(t *testing.T) {
	output := "D\tSTATE\t2\ttrue\r\nC\tnot-a-number\tA:1\tX\tY\tZ\r\nC\t1\tA:1\r\n"
	if got := parseChannels(output); len(got) != 0 {
		t.Fatalf("expected no channels, got %+v", got)
	}
}

func TestParseChannelsReadsRoomsAndTrades(t *testing.T) {
	channels := parseChannels("C\t1\tA:1\tSWITCH\tHmIP-RF\tLicht\nM\t1234,1235\t\nD\tSTATE\t2\ttrue\nC\t2\tA:2\tSWITCH\tHmIP-RF\tLicht 2\nM\t\t99\n")
	if len(channels) != 2 {
		t.Fatalf("unexpected channels: %+v", channels)
	}
	if len(channels[0].Rooms) != 2 || channels[0].Rooms[1] != 1235 || channels[0].Trades != nil || channels[0].Datapoints["STATE"] != true {
		t.Errorf("unexpected first channel: %+v", channels[0])
	}
	if channels[1].Rooms != nil || len(channels[1].Trades) != 1 || channels[1].Trades[0] != 99 {
		t.Errorf("unexpected second channel: %+v", channels[1])
	}
}

func TestParseChannelsMode(t *testing.T) {
	output := "C\t1\tA:1\tMULTI_MODE_INPUT_TRANSMITTER\tHmIP-RF\tTor\n" +
		"O\t3\n" +
		"C\t2\tA:2\tMULTI_MODE_INPUT_TRANSMITTER\tHmIP-RF\tTaster\n" +
		"C\t3\tA:3\tMULTI_MODE_INPUT_TRANSMITTER\tHmIP-RF\tKaputt\n" +
		"O\t9\n" +
		"C\t4\tA:4\tMULTI_MODE_INPUT_TRANSMITTER\tHmIP-RF\tAus\n" +
		"O\t0\n"
	channels := parseChannels(output)
	if len(channels) != 4 || channels[0].Mode == nil || *channels[0].Mode != 3 || channels[1].Mode != nil ||
		channels[2].Mode != nil || channels[3].Mode == nil || *channels[3].Mode != 0 {
		t.Fatalf("unexpected modes: %+v", channels)
	}
}

func TestParseChannelsOptions(t *testing.T) {
	channels := parseChannels("C\t1\tA:1\tSWITCH\tBidCos-RF\tLicht\nF\tfalse\tfalse\ttrue\ttrue\nC\t2\tA:2\tSWITCH\tBidCos-RF\tSteckdose\nF\ttrue\ttrue\tfalse\n")
	if len(channels) != 2 || !channels[0].Hidden || !channels[0].ReadOnly || !channels[0].Logged || !channels[0].AES || channels[1].AES {
		t.Fatalf("got %+v", channels)
	}
	if channels[1].Hidden || channels[1].ReadOnly || channels[1].Logged {
		t.Fatalf("got %+v", channels[1])
	}
}
