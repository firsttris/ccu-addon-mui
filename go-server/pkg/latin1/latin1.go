// Package latin1 converts text for the CCU's own processes. ReGa, rfd and
// hs485d keep strings as ISO-8859-1 bytes: the WebUI says so in webui.js
// ("ReGa arbeitet mit Latin-1 Zeichencodierung"), serves its pages with
// charset=iso-8859-1 (api/homematic.cgi, rega/pages/index.htm), and
// libXmlRpc declares encoding="iso-8859-1" and takes the bytes as they are
// (XmlRpcClient.cpp, XmlRpcUtil.cpp).
package latin1

import (
	"errors"
	"unicode/utf8"
)

// ErrNotLatin1 is returned for text with characters outside ISO-8859-1,
// which the CCU cannot store.
var ErrNotLatin1 = errors.New("text contains characters the CCU cannot store (only ISO-8859-1)")

// Encode converts text to ISO-8859-1 bytes.
func Encode(s string) ([]byte, error) {
	b := make([]byte, 0, len(s))
	for _, r := range s {
		if r > 0xFF || r == utf8.RuneError {
			return nil, ErrNotLatin1
		}
		b = append(b, byte(r))
	}
	return b, nil
}

// Decode converts ISO-8859-1 bytes to text.
func Decode(b []byte) string {
	runes := make([]rune, len(b))
	for i, c := range b {
		runes[i] = rune(c)
	}
	return string(runes)
}
