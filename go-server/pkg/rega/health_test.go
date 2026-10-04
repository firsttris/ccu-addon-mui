package rega

import "testing"

func TestParseDeviceHealth(t *testing.T) {
	output := "H\t0001\tHmIP-SWDO\tHmIP-RF\t1234\tBad\tLOW_BAT=false@1700000000;OPERATING_VOLTAGE=2.700000@1700000100;RSSI_DEVICE=-71@1700000100;\tFenster\tBad\n" +
		"H\tLEQ1\tHM-Sec-SC-2\tBidCos-RF\t\t\tLOWBAT=true@0;RSSI_DEVICE=@0;\tTür\n"
	devices := parseDeviceHealth(output)
	if len(devices) != 2 {
		t.Fatalf("got %d devices", len(devices))
	}
	first := devices[0]
	if first.Name != "Fenster\tBad" || first.RoomID != 1234 || first.Type != "HmIP-SWDO" {
		t.Fatalf("first: %+v", first)
	}
	if v := first.Values["OPERATING_VOLTAGE"]; v.Value != 2.7 || v.Time != 1700000100 {
		t.Fatalf("voltage: %+v", v)
	}
	second := devices[1]
	if second.Values["LOW_BAT"].Value != true || second.Values["RSSI_DEVICE"].Value != nil || second.RoomID != 0 {
		t.Fatalf("second: %+v", second)
	}
}
