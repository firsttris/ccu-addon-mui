package websocket

import (
	"errors"
	"fmt"
	"testing"

	"ccu-addon-mui-server/pkg/backup"
	"ccu-addon-mui-server/pkg/diagrams"
)

// A service's error answers with its code, also wrapped; one of the
// handler's own comes first; anything else is CCU_ERROR
func TestCodeOf(t *testing.T) {
	own := errors.New("own")
	for _, tt := range []struct {
		err  error
		want string
	}{
		{backup.ErrSessionRequired, "PASSWORD_REQUIRED"},
		{fmt.Errorf("save: %w", diagrams.ErrNotFound), "NOT_FOUND"},
		{own, "OWN"},
		{errors.New("something else"), "CCU_ERROR"},
	} {
		if got := codeOf(tt.err, errorCode{own, "OWN"}); got != tt.want {
			t.Errorf("codeOf(%v) = %s, want %s", tt.err, got, tt.want)
		}
	}
}
