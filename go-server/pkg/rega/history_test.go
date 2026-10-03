package rega

import "testing"

func TestParseHistory(t *testing.T) {
	entries, total := parseHistory("N\t120\nH\t3\t2026-10-03 21:00:05\tchannel\tWohnzimmer Licht\tSTATE\ttrue\t\nH\t4\t2026-10-03 20:59:00\tsysvar\tAnwesenheit\t\t1\tanwesend\n")
	if total != 120 || len(entries) != 2 {
		t.Fatalf("got %d %+v", total, entries)
	}
	if e := entries[0]; e.Group != 3 || e.Kind != "channel" || e.Datapoint != "STATE" || e.Value != "true" || e.Text != "" {
		t.Fatalf("got %+v", e)
	}
	if e := entries[1]; e.Kind != "sysvar" || e.Text != "anwesend" {
		t.Fatalf("got %+v", e)
	}
}

func TestGetHistoryRange(t *testing.T) {
	c := &Client{}
	for _, r := range [][2]int{{-1, 10}, {0, 0}, {0, 501}} {
		if _, _, err := c.GetHistory(r[0], r[1], 0); err == nil {
			t.Errorf("expected an error for %v", r)
		}
	}
}
