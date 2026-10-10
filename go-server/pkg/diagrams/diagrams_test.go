package diagrams

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestStore(t *testing.T) {
	path := filepath.Join(t.TempDir(), "diagrams.json")
	store, err := OpenStore(path)
	if err != nil || len(store.List()) != 0 {
		t.Fatalf("empty store: %v %v", store, err)
	}
	d := Diagram{Name: " Klima ", Series: []Series{{Address: "LEQ0000001:1", Datapoint: "ACTUAL_TEMPERATURE", Color: "#ff0000"}, {Address: SysvarAddress, Datapoint: "1234", Chart: "bar", Aggregate: "delta", Axis: "right"}}}
	saved, previous, err := store.Save(d)
	if err != nil || previous != nil || saved.ID == "" || saved.Name != "Klima" {
		t.Fatalf("save: %+v %v %v", saved, previous, err)
	}
	reopened, err := OpenStore(path)
	if err != nil || len(reopened.List()) != 1 || reopened.List()[0].ID != saved.ID {
		t.Fatalf("reopen: %+v %v", reopened.List(), err)
	}
	keys := reopened.Keys()
	if !keys["LEQ0000001:1.ACTUAL_TEMPERATURE"] || !keys["sysvar.1234"] || len(keys) != 2 {
		t.Errorf("keys: %v", keys)
	}
	saved.Name = "Wohnzimmer"
	if _, previous, err := reopened.Save(saved); err != nil || previous == nil || previous.Name != "Klima" {
		t.Errorf("update: %v %v", previous, err)
	}
	if _, _, err := reopened.Save(Diagram{ID: "nope", Name: "x", Series: d.Series}); !errors.Is(err, ErrNotFound) {
		t.Errorf("update unknown: %v", err)
	}
	if _, err := reopened.Delete(saved.ID); err != nil || len(reopened.List()) != 0 {
		t.Errorf("delete: %v", err)
	}
	if _, err := reopened.Delete(saved.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("delete twice: %v", err)
	}
}

func TestValidate(t *testing.T) {
	ok := Series{Address: "A:1", Datapoint: "LEVEL"}
	for name, d := range map[string]Diagram{
		"no name":    {Series: []Series{ok}},
		"no series":  {Name: "x"},
		"twice":      {Name: "x", Series: []Series{ok, ok}},
		"bad dp":     {Name: "x", Series: []Series{{Address: "A:1", Datapoint: "a.b"}}},
		"bad addr":   {Name: "x", Series: []Series{{Address: "../x", Datapoint: "LEVEL"}}},
		"bad color":  {Name: "x", Series: []Series{{Address: "A:1", Datapoint: "LEVEL", Color: "red"}}},
		"bad period": {Name: "x", Series: []Series{ok}, Period: "decade"},
		"bad place":  {Name: "x", Series: []Series{ok}, Places: []int64{0}},
		"bad chart":  {Name: "x", Series: []Series{{Address: "A:1", Datapoint: "LEVEL", Chart: "pie"}}},
		"bad agg":    {Name: "x", Series: []Series{{Address: "A:1", Datapoint: "LEVEL", Aggregate: "sum"}}},
		"bad axis":   {Name: "x", Series: []Series{{Address: "A:1", Datapoint: "LEVEL", Axis: "top"}}},
	} {
		if err := d.Validate(); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func TestRecorder(t *testing.T) {
	dir := t.TempDir()
	r := NewRecorder(dir)
	now := time.Date(2026, 10, 4, 12, 0, 30, 0, time.UTC)
	r.now = func() time.Time { return now }
	key := "A:1.ACTUAL_TEMPERATURE"
	r.Record(key, 20.0, now)
	if r.HasData(key) {
		t.Fatal("recorded an unwanted series")
	}
	r.SetWanted(map[string]bool{key: true, "A:1.STATE": true})
	r.Record(key, 20.0, now)
	r.Record(key, 22.0, now.Add(10*time.Second))
	r.Record(key, "PRESS", now)
	r.Record(key, 24.0, now.Add(time.Minute))
	r.Record("A:1.STATE", true, now)

	// Not written yet, but shown
	points := r.Query(key, now.Add(-time.Hour).Unix(), now.Add(time.Hour).Unix(), 0)
	if len(points) != 2 || points[0].Avg != 21 || points[0].Min != 20 || points[0].Max != 22 || points[0].N != 2 || points[1].Avg != 24 {
		t.Fatalf("points: %+v", points)
	}
	if p := r.Query("A:1.STATE", now.Add(-time.Hour).Unix(), now.Add(time.Hour).Unix(), 0); len(p) != 1 || p[0].Avg != 1 {
		t.Errorf("bool: %+v", p)
	}

	now = now.Add(2 * time.Minute)
	if err := r.Flush(false); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "minute", ".nobackup")); err != nil {
		t.Errorf("no .nobackup: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "minute", "A_1.ACTUAL_TEMPERATURE", "2026-10-04.csv")); err != nil {
		t.Errorf("minute file: %v", err)
	}
	// The hour is not over: not written, still shown
	if _, err := os.Stat(filepath.Join(dir, "hour", "A_1.ACTUAL_TEMPERATURE", "2026.csv")); err == nil {
		t.Error("unfinished hour written")
	}
	points = r.Query(key, now.Add(-time.Hour).Unix(), now.Add(time.Hour).Unix(), 0)
	if len(points) != 2 || points[0].Avg != 21 {
		t.Errorf("after flush: %+v", points)
	}
	// A year is read per hour
	year := r.Query(key, now.AddDate(-1, 0, 0).Unix(), now.Add(time.Hour).Unix(), 0)
	if len(year) != 1 || year[0].Avg != 22 || year[0].N != 3 || year[0].T != time.Date(2026, 10, 4, 12, 0, 0, 0, time.UTC).Unix() {
		t.Errorf("year: %+v", year)
	}

	// On shutdown the current hour is written too; a later value of the
	// same hour is merged
	if err := r.Flush(true); err != nil {
		t.Fatal(err)
	}
	r.Record(key, 26.0, now)
	year = r.Query(key, now.AddDate(-1, 0, 0).Unix(), now.Add(time.Hour).Unix(), 0)
	if len(year) != 1 || year[0].N != 4 || year[0].Max != 26 || year[0].Avg != 23 {
		t.Errorf("merged: %+v", year)
	}

	// Combined into buckets
	day := r.Query(key, now.Add(-12*time.Hour).Unix(), now.Add(12*time.Hour).Unix(), 2)
	if len(day) != 1 || day[0].Min != 20 || day[0].Max != 26 {
		t.Errorf("buckets: %+v", day)
	}
}

func TestImportAndPrune(t *testing.T) {
	dir := t.TempDir()
	r := NewRecorder(dir)
	now := time.Date(2026, 10, 4, 12, 0, 0, 0, time.UTC)
	r.now = func() time.Time { return now }
	key := "A:1.HUMIDITY"
	old := now.AddDate(0, -3, 0)
	if err := r.Import(key, []Sample{{T: old.Unix(), V: 50}, {T: now.Add(-time.Hour).Unix(), V: 60}, {T: now.Add(-time.Hour + time.Second).Unix(), V: 62}}); err != nil {
		t.Fatal(err)
	}
	if !r.HasData(key) {
		t.Fatal("no data after import")
	}
	// Too old for the per-minute values, kept per hour
	if _, err := os.Stat(r.file(minuteRes, key, old.Unix())); err == nil {
		t.Error("old minute imported")
	}
	if p := r.Query(key, now.AddDate(-1, 0, 0).Unix(), now.Unix(), 0); len(p) != 2 || p[0].Avg != 50 || p[1].Avg != 61 {
		t.Errorf("imported: %+v", p)
	}
	if p := r.Query(key, now.Add(-2*time.Hour).Unix(), now.Unix(), 0); len(p) != 1 || p[0].N != 2 {
		t.Errorf("imported minutes: %+v", p)
	}
	now = now.Add(MinuteRetention + 48*time.Hour)
	r.Prune()
	if p := r.Query(key, now.Add(-minuteRange).Unix(), now.Unix(), 0); len(p) != 0 {
		t.Errorf("not pruned: %+v", p)
	}
}

func TestRun(t *testing.T) {
	dir := t.TempDir()
	r := NewRecorder(dir)
	r.SetWanted(map[string]bool{"A:1.LEVEL": true})
	r.Record("A:1.LEVEL", 0.5, time.Now())
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		r.Run(ctx, time.Hour, func(err error) { t.Error(err) })
		close(done)
	}()
	cancel()
	<-done
	entries, _ := os.ReadDir(filepath.Join(dir, "minute", "A_1.LEVEL"))
	if len(entries) != 1 {
		t.Errorf("not written on shutdown: %v", entries)
	}
}

func TestToFloat(t *testing.T) {
	for _, c := range []struct {
		in   any
		want float64
		ok   bool
	}{{1.5, 1.5, true}, {3, 3, true}, {int64(4), 4, true}, {true, 1, true}, {false, 0, true}, {"2.5", 2.5, true}, {"true", 1, true}, {"x", 0, false}, {nil, 0, false}} {
		if v, ok := ToFloat(c.in); v != c.want || ok != c.ok {
			t.Errorf("%v: %v %v", c.in, v, ok)
		}
	}
}
