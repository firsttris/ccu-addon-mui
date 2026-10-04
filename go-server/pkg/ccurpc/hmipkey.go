package ccurpc

import (
	"encoding/hex"
	"errors"
	"regexp"
	"strings"
)

// The characters of the base32 key printed on HmIP devices (webui.js
// convertHmIPKeyBase32ToBase16: no D, I, O, V)
const hmipKeyChars = "0123456789ABCEFGHJKLMNPQRSTUWXYZ"

var (
	ErrInvalidSGTIN = errors.New("the SGTIN must have 24 hexadecimal digits")
	ErrInvalidKey   = errors.New("invalid device key")

	sgtinRegex  = regexp.MustCompile(`^[0-9A-F]{24}$`)
	hexKeyRegex = regexp.MustCompile(`^[0-9A-F]{32}$`)
)

// HmIPWhitelistEntry normalizes the SGTIN and KEY from a device's label as
// cp_add_device.cgi does (dashes and spaces removed, upper case) and turns
// a base32 key into the 32 hexadecimal digits setInstallModeWithWhitelist
// takes
func HmIPWhitelistEntry(sgtin, key string) (string, string, error) {
	clean := func(s string) string {
		return strings.ToUpper(strings.NewReplacer("-", "", " ", "").Replace(strings.TrimSpace(s)))
	}
	sgtin, key = clean(sgtin), clean(key)
	if !sgtinRegex.MatchString(sgtin) {
		return "", "", ErrInvalidSGTIN
	}
	if len(key) < 32 {
		converted, err := hmipKeyBase32ToHex(key)
		if err != nil {
			return "", "", err
		}
		key = converted
	}
	if !hexKeyRegex.MatchString(key) {
		return "", "", ErrInvalidKey
	}
	return sgtin, key, nil
}

// hmipKeyBase32ToHex is convertHmIPKeyBase32ToBase16: the characters from
// the end, 5 bits each, into 16 bytes
func hmipKeyBase32ToHex(text string) (string, error) {
	// 128 bits are 26 characters; the label may leave out leading zeros
	if len(text) < 20 || len(text) > 26 {
		return "", ErrInvalidKey
	}
	key := make([]byte, 16)
	value, bits, pos := 0, 0, len(key)-1
	for i := len(text) - 1; i >= 0; i-- {
		digit := strings.IndexByte(hmipKeyChars, text[i])
		if digit < 0 {
			return "", ErrInvalidKey
		}
		value |= digit << bits
		bits += 5
		for bits > 8 && pos >= 0 {
			key[pos] = byte(value & 0xff)
			value >>= 8
			bits -= 8
			pos--
		}
	}
	return strings.ToUpper(hex.EncodeToString(key)), nil
}
