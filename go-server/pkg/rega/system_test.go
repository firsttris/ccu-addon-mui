package rega

import "testing"

func TestParseSystemSettings(t *testing.T) {
	settings, err := parseSystemSettings("OK\t52.520000\t13.405000\t60.000000\t2026-10-03 22:15:00\n")
	if err != nil {
		t.Fatal(err)
	}
	if settings.Latitude != 52.52 || settings.Longitude != 13.405 || settings.TimeZoneOffset != 60 || settings.Time != "2026-10-03 22:15:00" {
		t.Fatalf("got %+v", settings)
	}
	if hours, _ := parseSystemSettings("OK\t0\t0\t-3.5\t2026-10-03 22:15:00"); hours.TimeZoneOffset != -210 {
		t.Fatalf("hours not read as such: %+v", hours)
	}
	if _, err := parseSystemSettings("garbage"); err == nil {
		t.Fatal("expected an error")
	}
}

func TestFormatCoordinate(t *testing.T) {
	for value, want := range map[float64]string{52.52: "52.52", -0.0000001: "0", 13.4050004: "13.405", 1e-5: "0.00001"} {
		if got := FormatCoordinate(value); got != want {
			t.Errorf("FormatCoordinate(%v) = %q, want %q", value, got, want)
		}
	}
}
