package ccurpc

import (
	"errors"
	"fmt"
	"reflect"
	"testing"
)

// scriptedCaller answers calls with fixed values or XML-RPC faults and
// records them.
type scriptedCaller struct {
	replies map[string]interface{}
	faults  map[string]int
	calls   []string
}

func (s *scriptedCaller) Call(method string, args interface{}, reply interface{}) error {
	s.calls = append(s.calls, method)
	if code, ok := s.faults[method]; ok {
		return fmt.Errorf("Fault(%d): failed", code)
	}
	value, ok := s.replies[method]
	if !ok {
		return fmt.Errorf("unexpected call %s", method)
	}
	reflect.ValueOf(reply).Elem().Set(reflect.ValueOf(value))
	return nil
}

func deviceReply(deviceType string) map[string]interface{} {
	return map[string]interface{}{"ADDRESS": "X", "TYPE": deviceType}
}

func radioModules(dutyCycle int) []interface{} {
	return []interface{}{
		map[string]interface{}{"ADDRESS": "GW1", "TYPE": "HMLGW2", "DUTY_CYCLE": 95},
		map[string]interface{}{"ADDRESS": "NEQ1", "TYPE": "CCU2", "DUTY_CYCLE": dutyCycle},
	}
}

func TestInstallFirmwareMethodPerInterface(t *testing.T) {
	bidcos := &scriptedCaller{replies: map[string]interface{}{
		"getDeviceDescription": deviceReply("HM-LC-Sw1-FM"),
		"listBidcosInterfaces": radioModules(12),
		"updateFirmware":       []interface{}{true},
	}}
	hmip := &scriptedCaller{replies: map[string]interface{}{
		"getDeviceDescription": deviceReply("HmIP-SWDO"),
		"installFirmware":      true,
	}}
	client := newClient(map[string]caller{"BidCos-RF": bidcos, "HmIP-RF": hmip})
	if err := client.InstallFirmware("BidCos-RF", "LEQ0000001"); err != nil {
		t.Fatal(err)
	}
	if err := client.InstallFirmware("HmIP-RF", "0008DA8A9F1234"); err != nil {
		t.Fatal(err)
	}
	// The HmIP update checks the duty cycle on BidCos-RF too; the gateway's
	// high one does not count, only the CCU's own module
	if got := fmt.Sprint(bidcos.calls); got != "[getDeviceDescription listBidcosInterfaces updateFirmware listBidcosInterfaces]" {
		t.Fatalf("BidCos calls: %s", got)
	}
	if got := fmt.Sprint(hmip.calls); got != "[getDeviceDescription installFirmware]" {
		t.Fatalf("HmIP calls: %s", got)
	}
}

func TestInstallFirmwareRefused(t *testing.T) {
	bidcos := &scriptedCaller{
		replies: map[string]interface{}{"listBidcosInterfaces": radioModules(85)},
	}
	wired := &scriptedCaller{replies: map[string]interface{}{
		"getDeviceDescription": deviceReply("HmIPW-DRAP"),
		"installFirmware":      false,
	}}
	hmip := &scriptedCaller{
		replies: map[string]interface{}{"getDeviceDescription": deviceReply("HmIP-SWSD")},
		faults:  map[string]int{"installFirmware": -1},
	}
	client := newClient(map[string]caller{"BidCos-RF": bidcos, "HmIP-Wired": wired, "HmIP-RF": hmip})

	if err := client.InstallFirmware("HmIP-RF", "0008DA8A9F1234"); !errors.Is(err, ErrDutyCycleHigh) {
		t.Fatalf("duty cycle at 85 %%: got %v", err)
	}
	// Wired devices update whatever the radio does; false: not started
	if err := client.InstallFirmware("HmIP-Wired", "0019DA8A9F1234"); err == nil || errors.Is(err, ErrDutyCycleHigh) {
		t.Fatalf("wired: got %v", err)
	}
	bidcos.replies["listBidcosInterfaces"] = radioModules(79)
	if err := client.InstallFirmware("HmIP-RF", "0008DA8A9F1234"); !errors.Is(err, ErrDeviceUnreachable) {
		t.Fatalf("fault -1: got %v", err)
	}
	bidcos.replies["getDeviceDescription"] = deviceReply("HM-TC-IT-WM-W-EU")
	bidcos.faults = map[string]int{"updateFirmware": -10}
	if err := client.InstallFirmware("BidCos-RF", "LEQ0000004"); !errors.Is(err, ErrDeviceUnreachable) {
		t.Fatalf("fault -10: got %v", err)
	}
	if err := client.InstallFirmware("BidCos-RF", "LEQ0000004:1"); !errors.Is(err, ErrInvalidAddress) {
		t.Fatalf("channel address: got %v", err)
	}
}

func TestDutyCycleWithoutBidCos(t *testing.T) {
	// OpenCCU without BidCos-RF: the HmIP module's duty cycle counts
	hmip := &scriptedCaller{replies: map[string]interface{}{
		"getDeviceDescription": deviceReply("HmIP-SWDO"),
		"listBidcosInterfaces": radioModules(90),
	}}
	client := newClient(map[string]caller{"HmIP-RF": hmip})
	if err := client.InstallFirmware("HmIP-RF", "0008DA8A9F1234"); !errors.Is(err, ErrDutyCycleHigh) {
		t.Fatalf("got %v", err)
	}
}
