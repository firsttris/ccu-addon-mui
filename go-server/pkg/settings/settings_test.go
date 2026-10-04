package settings

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestEnergyPrice(t *testing.T) {
	dir := t.TempDir()
	s := New(dir)
	if p, err := s.EnergyPrice(); err != nil || p.Currency != "EUR" || p.Electricity != 0 {
		t.Fatalf("without file: %+v %v", p, err)
	}
	// As the HMServer writes it
	_ = os.WriteFile(filepath.Join(dir, "energyPrice"), []byte("\"currency\":\"CHF\"\n\"curPrice\":\"0.31\"\n\"gasPrice\":\"0,12\"\n\"gasHeatingValue\":\"11.2\"\n\"gasConditionNumber\":\"0.95\"\n"), 0o644)
	p, err := s.EnergyPrice()
	if err != nil || p != (EnergyPrice{Currency: "CHF", Electricity: 0.31, Gas: 0.12, GasHeatingValue: 11.2, GasConditionNumber: 0.95}) {
		t.Fatalf("read: %+v %v", p, err)
	}
	// The first version of the file
	_ = os.WriteFile(filepath.Join(dir, "energyPrice"), []byte("0.28\nEUR\n"), 0o644)
	if p, _ := s.EnergyPrice(); p.Electricity != 0.28 || p.Currency != "EUR" {
		t.Errorf("old file: %+v", p)
	}
	next := EnergyPrice{Currency: "EUR", Electricity: 0.3245, Gas: 0.1, GasHeatingValue: 11.4, GasConditionNumber: 0.9636}
	if err := s.SetEnergyPrice(next); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(filepath.Join(dir, "energyPrice"))
	if string(data) != "\"currency\":\"EUR\"\n\"curPrice\":\"0.3245\"\n\"gasPrice\":\"0.1\"\n\"gasHeatingValue\":\"11.4\"\n\"gasConditionNumber\":\"0.9636\"\n" {
		t.Errorf("written: %q", data)
	}
	if p, _ := s.EnergyPrice(); p != next {
		t.Errorf("round trip: %+v", p)
	}
	if err := s.SetEnergyPrice(EnergyPrice{Currency: "USD"}); !errors.Is(err, ErrInvalid) {
		t.Errorf("unknown currency: %v", err)
	}
	if err := s.SetEnergyPrice(EnergyPrice{Currency: "EUR", Electricity: -1}); !errors.Is(err, ErrInvalid) {
		t.Errorf("negative price: %v", err)
	}
}

func TestInfoLEDAndFlags(t *testing.T) {
	dir := t.TempDir()
	s := New(dir)
	if led := s.InfoLED(); !led.Service || !led.Alarm {
		t.Errorf("default: %+v", led)
	}
	if err := s.SetInfoLED(InfoLED{Service: false, Alarm: true}); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(filepath.Join(dir, "hss_led_info.conf"))
	if string(data) != "IgnoreServiceMessages=true\nIgnoreAlarmMessages=false\n" {
		t.Errorf("written: %q", data)
	}
	if led := s.InfoLED(); led.Service || !led.Alarm {
		t.Errorf("read: %+v", led)
	}

	if s.Flag(HideStickyUnreach) {
		t.Error("flag without file")
	}
	if err := s.SetFlag(HideStickyUnreach, true); err != nil || !s.Flag(HideStickyUnreach) {
		t.Errorf("set: %v", err)
	}
	if err := s.SetFlag(HideStickyUnreach, false); err != nil || s.Flag(HideStickyUnreach) {
		t.Errorf("clear: %v", err)
	}
	if err := s.SetFlag(FieldTest, false); err != nil {
		t.Errorf("clear missing: %v", err)
	}
}

func TestStorage(t *testing.T) {
	dir := t.TempDir()
	_ = os.MkdirAll(filepath.Join(dir, "a"), 0o755)
	_ = os.WriteFile(filepath.Join(dir, "a", "x.csv"), make([]byte, 1000), 0o644)
	st := StorageOf(dir)
	if st.Used != 1000 || st.Total <= 0 || st.Free <= 0 {
		t.Errorf("storage: %+v", st)
	}
	// A directory not created yet: its file system still counts
	if st := StorageOf(filepath.Join(dir, "missing", "deeper")); st.Used != 0 || st.Total <= 0 {
		t.Errorf("missing: %+v", st)
	}
}
