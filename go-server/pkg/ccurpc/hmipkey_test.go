package ccurpc

import (
	"errors"
	"testing"
)

func TestHmIPWhitelistEntry(t *testing.T) {
	sgtin, key, err := HmIPWhitelistEntry("3014-F711-A000-1F98-A9B4-C2D1", "00112233445566778899aabbccddeeff")
	if err != nil || sgtin != "3014F711A0001F98A9B4C2D1" || key != "00112233445566778899AABBCCDDEEFF" {
		t.Fatalf("%s %s %v", sgtin, key, err)
	}
	// Base32 as on the label, with dashes: 5 bits per character from the end
	_, key, err = HmIPWhitelistEntry("3014F711A0001F98A9B4C2D1", "00000-00000-00000-00000-00001")
	if err != nil || key != "00000000000000000000000000000001" {
		t.Fatalf("%s %v", key, err)
	}
	_, key, err = HmIPWhitelistEntry("3014F711A0001F98A9B4C2D1", "00000000000000000000000001")
	if err != nil || key != "00000000000000000000000000000001" {
		t.Fatalf("%s %v", key, err)
	}
	_, key, _ = HmIPWhitelistEntry("3014F711A0001F98A9B4C2D1", "000000000000000000000000Z1")
	// Z is 31: 31<<5 | 1 = 0x3E1
	if key != "000000000000000000000000000003E1" {
		t.Fatalf("%s", key)
	}
	if _, _, err := HmIPWhitelistEntry("3014F711", "00000000000000000000000001"); !errors.Is(err, ErrInvalidSGTIN) {
		t.Error(err)
	}
	if _, _, err := HmIPWhitelistEntry("3014F711A0001F98A9B4C2D1", "0000000000000000000000000D"); !errors.Is(err, ErrInvalidKey) {
		t.Error("D is no key character")
	}
}
