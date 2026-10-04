package websocket

import (
	"fmt"
	"testing"
)

// As webui.js fetchAndSetDeviceVersion and setDeviceVersion map eQ-3's
// names to the CCU's device types and back
func TestDeviceFirmwareTypes(t *testing.T) {
	for eq3, want := range map[string]string{
		"HmIP-SWDO":    "[hmip-swdo]",
		"HM-LC-Sw1_FM": "[hm-lc-sw1 fm]",
		"HmIP-HAP":     "[hmip-hap hmip-hap-b1]",
		"HmIP-HAP-JS1": "[hmip-hap js1]",
	} {
		if got := fmt.Sprint(catalogTypes(eq3)); got != want {
			t.Errorf("catalogTypes(%q) = %s, want %s", eq3, got, want)
		}
	}
	for deviceType, want := range map[string]string{
		"HmIP-SWDO":    "HmIP-SWDO",
		"HM-LC-Sw1 FM": "HM-LC-Sw1_FM",
		"HmIP-HAP JS1": "HmIP-HAP-JS1",
		"HmIP-HAP-B1":  "HmIP-HAP",
	} {
		if got := downloadProduct(deviceType); got != want {
			t.Errorf("downloadProduct(%q) = %s, want %s", deviceType, got, want)
		}
	}
}
