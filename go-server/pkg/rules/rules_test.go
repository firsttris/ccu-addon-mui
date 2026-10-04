package rules

import (
	"errors"
	"path/filepath"
	"testing"
	"time"
)

type fakeValues map[string]map[string]interface{}

func (f fakeValues) GetParamset(iface, address, key string) (map[string]interface{}, error) {
	if v, ok := f[address]; ok {
		return v, nil
	}
	return nil, errors.New("unknown channel")
}

func window(minutes int) Rule {
	return Rule{
		Name: "Fenster Bad offen", Enabled: true, Minutes: minutes, Message: "Fenster Bad ist offen",
		Conditions: []Condition{
			{InterfaceName: "HmIP-RF", Address: "003660C9930AB6:1", Datapoint: "STATE", Op: "ne", Value: 0},
			{InterfaceName: "HmIP-RF", Address: "000A9D89A7AF25:1", Datapoint: "ACTUAL_TEMPERATURE", Op: "lt", Value: 18},
		},
	}
}

func setup(t *testing.T, rule Rule, values fakeValues) (*Engine, *[]string, *time.Time) {
	t.Helper()
	store, err := OpenStore(filepath.Join(t.TempDir(), "rules.json"))
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := store.Save(rule); err != nil {
		t.Fatal(err)
	}
	var sent []string
	now := time.Date(2026, 1, 15, 12, 0, 0, 0, time.Local)
	e := NewEngine(store, values, func(r Rule) { sent = append(sent, r.Name) })
	e.now = func() time.Time { return now }
	return e, &sent, &now
}

func TestRuleNotifiesAfterTheDurationOnce(t *testing.T) {
	e, sent, now := setup(t, window(15), fakeValues{
		"003660C9930AB6:1": {"STATE": 0},
		"000A9D89A7AF25:1": {"ACTUAL_TEMPERATURE": 16.5},
	})
	e.Evaluate()
	e.OnEvent("003660C9930AB6:1", "STATE", 1)
	*now = now.Add(14 * time.Minute)
	e.Evaluate()
	if len(*sent) != 0 {
		t.Fatalf("notified too early: %v", *sent)
	}
	*now = now.Add(time.Minute)
	e.Evaluate()
	e.Evaluate()
	if len(*sent) != 1 {
		t.Fatalf("want one notification, got %v", *sent)
	}
	// Closed and opened again: a new notification after the duration
	e.OnEvent("003660C9930AB6:1", "STATE", 0)
	e.OnEvent("003660C9930AB6:1", "STATE", 1)
	*now = now.Add(15 * time.Minute)
	e.Evaluate()
	if len(*sent) != 2 {
		t.Fatalf("want a second notification, got %v", *sent)
	}
}

func TestRuleNeedsAllConditions(t *testing.T) {
	e, sent, _ := setup(t, window(0), fakeValues{
		"003660C9930AB6:1": {"STATE": 1},
		"000A9D89A7AF25:1": {"ACTUAL_TEMPERATURE": 21.0},
	})
	e.Evaluate()
	if len(*sent) != 0 {
		t.Fatalf("warm: no notification, got %v", *sent)
	}
	e.OnEvent("000A9D89A7AF25:1", "ACTUAL_TEMPERATURE", 17.5)
	if len(*sent) != 1 {
		t.Fatalf("cold and open: want a notification, got %v", *sent)
	}
}

func TestRuleTimeWindowAcrossMidnight(t *testing.T) {
	rule := Rule{
		Name: "Haustür nachts", Enabled: true, From: "22:00", To: "06:00", Message: "Haustür geöffnet",
		Conditions: []Condition{{InterfaceName: "HmIP-RF", Address: "0000DBE9A5C1F2:1", Datapoint: "STATE", Op: "eq", Value: 1}},
	}
	e, sent, now := setup(t, rule, fakeValues{"0000DBE9A5C1F2:1": {"STATE": 0}})
	e.Evaluate()
	e.OnEvent("0000DBE9A5C1F2:1", "STATE", true)
	if len(*sent) != 0 {
		t.Fatalf("at noon: no notification, got %v", *sent)
	}
	e.OnEvent("0000DBE9A5C1F2:1", "STATE", false)
	*now = time.Date(2026, 1, 16, 2, 30, 0, 0, time.Local)
	e.OnEvent("0000DBE9A5C1F2:1", "STATE", true)
	if len(*sent) != 1 {
		t.Fatalf("at night: want a notification, got %v", *sent)
	}
}

func TestDisabledAndUnknownValues(t *testing.T) {
	rule := window(0)
	rule.Enabled = false
	e, sent, _ := setup(t, rule, fakeValues{})
	e.OnEvent("003660C9930AB6:1", "STATE", 1)
	e.Evaluate()
	if len(*sent) != 0 {
		t.Fatalf("disabled rule notified: %v", *sent)
	}
}

func TestValidate(t *testing.T) {
	bad := []func(r *Rule){
		func(r *Rule) { r.Name = " " },
		func(r *Rule) { r.Conditions = nil },
		func(r *Rule) { r.Conditions[0].Op = "le" },
		func(r *Rule) { r.Conditions[0].Address = "003660C9930AB6" },
		func(r *Rule) { r.Minutes = -1 },
		func(r *Rule) { r.From = "22:00" },
		func(r *Rule) { r.From, r.To = "25:00", "06:00" },
	}
	for i, change := range bad {
		r := window(0)
		change(&r)
		if err := r.Validate(); !errors.Is(err, ErrInvalid) {
			t.Errorf("case %d: want ErrInvalid, got %v", i, err)
		}
	}
	r := window(0)
	if err := r.Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestStoreKeepsRules(t *testing.T) {
	path := filepath.Join(t.TempDir(), "rules.json")
	store, _ := OpenStore(path)
	saved, _, err := store.Save(window(15))
	if err != nil || saved.ID == "" {
		t.Fatalf("save: %v %v", saved, err)
	}
	saved.Minutes = 30
	if _, previous, err := store.Save(saved); err != nil || previous == nil || previous.Minutes != 15 {
		t.Fatalf("replace: %v %v", previous, err)
	}
	reopened, _ := OpenStore(path)
	if list := reopened.List(); len(list) != 1 || list[0].Minutes != 30 {
		t.Fatalf("reopened: %v", list)
	}
	if _, err := reopened.Delete(saved.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := reopened.Delete(saved.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}
