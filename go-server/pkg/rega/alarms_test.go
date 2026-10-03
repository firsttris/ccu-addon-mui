package rega

import "testing"

func TestParseAlarmMessages(t *testing.T) {
	output := "A\t954\ttrue\t2\t2026-01-15 09:12:00\t2026-01-15 09:30:00\tWassermelder Keller\tKeller\tausgelöst\tWasseralarm\n" +
		"A\t960\tfalse\t1\t2026-01-14 22:00:00\t2026-01-14 22:05:00\t\t\tnicht ausgelöst\tAlarm\tZone 2\n" +
		"A\tbroken\n"
	got := parseAlarmMessages(output)
	if len(got) != 2 {
		t.Fatalf("expected 2 alarms, got %+v", got)
	}
	if got[0] != (AlarmMessage{ID: 954, Name: "Wasseralarm", Active: true, Counter: 2, FirstTime: "2026-01-15 09:12:00",
		LastTime: "2026-01-15 09:30:00", Channel: "Wassermelder Keller", RoomName: "Keller", Message: "ausgelöst"}) {
		t.Errorf("first alarm: %+v", got[0])
	}
	// A tab in the name is kept
	if got[1].Name != "Alarm\tZone 2" || got[1].Active {
		t.Errorf("second alarm: %+v", got[1])
	}
}
