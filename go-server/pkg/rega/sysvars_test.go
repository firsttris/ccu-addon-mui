package rega

import "testing"

func TestParseSysvars(t *testing.T) {
	output := "V\t950\ttrue\tAnwesenheit\nT\t2\t23\t\nR\t\t\nB\tabwesend\tanwesend\nL\t\nX\ttrue\n" +
		"V\t951\ttrue\tAußentemperatur\nT\t4\t0\t°C\nR\t-50\t60\nB\t\t\nL\t\nX\t12.5\n" +
		"V\t952\tfalse\tModus\nT\t16\t29\t\nR\t\t\nB\t\t\nL\tAus;Tag;Nacht\nX\t2\n" +
		"V\t953\ttrue\tNotiz\nT\t20\t11\t\nR\t\t\nB\t\t\nL\t\nX\tFenster\tzu\n" +
		"V\t954\ttrue\tAlarm Keller\nT\t2\t6\t\nR\t\t\nB\tnicht ausgelöst\tausgelöst\nL\t\nX\tfalse\n"
	sysvars := parseSysvars(output)
	if len(sysvars) != 5 {
		t.Fatalf("expected 5 sysvars, got %+v", sysvars)
	}
	presence := sysvars[0]
	if presence.Kind != "bool" || presence.Value != true || presence.TrueName != "anwesend" || !presence.Visible {
		t.Errorf("unexpected presence: %+v", presence)
	}
	temperature := sysvars[1]
	if temperature.Kind != "number" || temperature.Value != 12.5 || temperature.Unit != "°C" || *temperature.Min != -50 || *temperature.Max != 60 {
		t.Errorf("unexpected temperature: %+v", temperature)
	}
	mode := sysvars[2]
	if mode.Kind != "enum" || mode.Value != 2.0 || len(mode.ValueList) != 3 || mode.ValueList[2] != "Nacht" || mode.Visible {
		t.Errorf("unexpected mode: %+v", mode)
	}
	if note := sysvars[3]; note.Kind != "string" || note.Value != "Fenster\tzu" {
		t.Errorf("unexpected note: %+v", note)
	}
	if alarm := sysvars[4]; alarm.Kind != "alarm" || alarm.Value != false || alarm.TrueName != "ausgelöst" {
		t.Errorf("unexpected alarm: %+v", alarm)
	}
}
