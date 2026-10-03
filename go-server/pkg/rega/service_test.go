package rega

import "testing"

func TestParseServiceMessages(t *testing.T) {
	output := "S\t4711\tSTICKY_UNREACH\ttrue\t2026-01-15 09:12:00\t000A9D89A7AE61\t4657\tEG\tWandthermostat EG Flur\n" +
		"S\t4712\tERROR_CODE\t7\t2026-01-15 09:13:00\tMEQ0123456\t\t\tFenster\tgriff\n"
	messages := parseServiceMessages(output)
	if len(messages) != 2 {
		t.Fatalf("got %d messages: %v", len(messages), messages)
	}
	first := messages[0]
	if first.ID != 4711 || first.Type != "STICKY_UNREACH" || first.Value != "" || first.RoomID != 4657 || first.Name != "Wandthermostat EG Flur" {
		t.Fatalf("unexpected first message: %+v", first)
	}
	// A tab in the name is part of it; the error code is kept
	if second := messages[1]; second.Value != "7" || second.RoomID != 0 || second.Name != "Fenster\tgriff" {
		t.Fatalf("unexpected second message: %+v", second)
	}
}
