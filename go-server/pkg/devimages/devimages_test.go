package devimages

import "testing"

const sample = `#!/bin/tclsh
array set DEV_PATHS       {HmIP-WRC6 {{50 /config/img/devices/50/131_hmip-wrc6_thumb.png} {250 /config/img/devices/250/131_hmip-wrc6.png}} HM-LC-Sw1-FM {{50 /config/img/devices/50/4_hm-lc-sw1-fm_thumb.png} {250 /config/img/devices/250/4_hm-lc-sw1-fm.png}} {263 167} {{50 /config/img/devices/50/x.png} {250 /config/img/devices/250/x.png}} NOPIC {}}
array set DEV_HIGHLIGHT   {HmIP-WRC6 {{"1" 1 0.3 0.358 0.025} {"2" 1 0.705 0.315 0.025} {"1+2" 5 '1' '2'}} HM-LC-Sw1-FM {{"1_AUS" 2 0.288 0.66 0.068 0.152} {"1_EIN" 2 0.548 0.66 0.068 0.152} {"1" 5   '1_AUS'  '1_EIN'  }} {263 167} {}}
`

func TestParse(t *testing.T) {
	images, err := Parse(sample)
	if err != nil {
		t.Fatal(err)
	}
	wrc6 := images["hmip-wrc6"]
	if wrc6.Path != "250/131_hmip-wrc6.png" {
		t.Fatalf("path: %+v", wrc6)
	}
	// Circles: x, y is the top left, the radius doubled
	if s := wrc6.Channels["1"]; len(s) != 1 || s[0] != (Shape{Kind: "circle", X: 0.3, Y: 0.358, W: 0.05, H: 0.05}) {
		t.Fatalf("channel 1: %+v", s)
	}
	if s := wrc6.Channels["1+2"]; len(s) != 2 || s[1].X != 0.705 {
		t.Fatalf("channel 1+2: %+v", s)
	}
	// A set of two rectangles (on and off of a switch)
	if s := images["hm-lc-sw1-fm"].Channels["1"]; len(s) != 2 || s[0].Kind != "rect" || s[1].X != 0.548 {
		t.Fatalf("switch channel 1: %+v", s)
	}
	// Types with spaces and without highlights
	if img, ok := images["263 167"]; !ok || img.Channels != nil {
		t.Fatalf("263 167: %+v", img)
	}
	if _, ok := images["nopic"]; ok {
		t.Fatal("a type without picture has none")
	}
}
