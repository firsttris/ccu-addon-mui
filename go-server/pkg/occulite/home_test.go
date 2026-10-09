package occulite

import "testing"

// The app keeps ids (rooms, layouts, favorites): the same path or ref must
// always give the same id, below 2^52 for JavaScript
func TestIDIsStable(t *testing.T) {
	a, b := ID("room/eg/wohnzimmer"), ID("room/eg/wohnzimmer")
	if a != b || a <= 0 || a >= 1<<52 {
		t.Fatalf("id %d %d", a, b)
	}
	if ID("room/eg/kueche") == a || ID("HmIP-RF.0001:1") == ID("HmIP-RF.0001:2") {
		t.Fatal("different keys, same id")
	}
}

func TestSlug(t *testing.T) {
	for name, want := range map[string]string{
		"Gäste-WC":      "gaeste-wc",
		"Büro / Straße": "buero-strasse",
		"!!!":           "raum",
		"Ein sehr, sehr langer Raumname im Obergeschoss": "ein-sehr-sehr-langer-raumname-im",
	} {
		if got := slug(name); got != want {
			t.Errorf("slug(%q) = %q, want %q", name, got, want)
		}
	}
}

// A second room of the same long name stays a valid node id (≤ 32)
func TestUniqueSlug(t *testing.T) {
	name := "Ein sehr, sehr langer Raumname im Obergeschoss"
	taken := map[string]bool{"ein-sehr-sehr-langer-raumname-im": true}
	if got := uniqueSlug(name, taken); got != "ein-sehr-sehr-langer-raumname-2" {
		t.Fatalf("got %q", got)
	}
	taken["ein-sehr-sehr-langer-raumname-2"] = true
	if got := uniqueSlug(name, taken); got != "ein-sehr-sehr-langer-raumname-3" {
		t.Fatalf("got %q", got)
	}
	if got := uniqueSlug("Bad", map[string]bool{"bad": true}); got != "bad-2" {
		t.Fatalf("got %q", got)
	}
	// A cut that ends on "-" loses it
	if got := uniqueSlug("aaaaaaaaaaaaaaaaaaaaaaaaaaaaa b", map[string]bool{"aaaaaaaaaaaaaaaaaaaaaaaaaaaaa-b": true}); got != "aaaaaaaaaaaaaaaaaaaaaaaaaaaaa-2" {
		t.Fatalf("got %q", got)
	}
}

// The app sends values as text, the interface wants them typed
func TestTypedValue(t *testing.T) {
	cases := []struct {
		kind, value string
		want        interface{}
	}{
		{"BOOL", "true", true}, {"BOOL", "false", false}, {"ACTION", "1", true},
		{"FLOAT", "21.5", 21.5}, {"INTEGER", "3", 3}, {"ENUM", "2", 2}, {"INTEGER", "4.0", 4},
		{"STRING", "Hallo", "Hallo"},
	}
	for _, c := range cases {
		got, err := typedValue(c.kind, c.value)
		if err != nil || got != c.want {
			t.Errorf("%s %q = %v (%T), %v", c.kind, c.value, got, got, err)
		}
	}
	if _, err := typedValue("FLOAT", "warm"); err == nil {
		t.Error("FLOAT warm accepted")
	}
}
