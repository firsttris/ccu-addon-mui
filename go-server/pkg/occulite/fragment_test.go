package occulite

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// occulited takes the add-on's lighttpd fragment only when every directive
// is on one line: its check reads a value up to the end of the line and
// refuses the whole fragment otherwise (occulited
// internal/system/lighttpdropin.go). A refused fragment leaves the
// WebSocket at 404 on a real openccu-lite.
func TestLighttpdFragmentOneDirectivePerLine(t *testing.T) {
	data, err := os.ReadFile("../../../addon_installer/lite/lighttpd.conf")
	if err != nil {
		t.Fatal(err)
	}
	directive := regexp.MustCompile(`^\s*[a-z][a-z0-9.-]*\s*\+?=`)
	for n, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "#") || !directive.MatchString(line) {
			continue
		}
		if strings.Count(line, "(") != strings.Count(line, ")") {
			t.Errorf("line %d: a directive that goes on beyond its line: %s", n+1, line)
		}
	}
}
