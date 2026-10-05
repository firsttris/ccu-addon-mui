package latin1

import "testing"

func TestRoundTrip(t *testing.T) {
	s := "Licht Küche, Außen 20 °C ©"
	b, err := Encode(s)
	if err != nil {
		t.Fatal(err)
	}
	if string(b) != "Licht K\xfcche, Au\xdfen 20 \xb0C \xa9" {
		t.Fatalf("Encode = %q", b)
	}
	if got := Decode(b); got != s {
		t.Fatalf("Decode = %q", got)
	}
}

func TestEncodeRejectsOtherCharacters(t *testing.T) {
	for _, s := range []string{"5 €", "…", "😀", "a\xffb"} {
		if _, err := Encode(s); err != ErrNotLatin1 {
			t.Errorf("Encode(%q) = %v", s, err)
		}
	}
}
