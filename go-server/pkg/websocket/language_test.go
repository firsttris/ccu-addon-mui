package websocket

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"ccu-addon-mui-server/pkg/auth"
)

// The user's language as the WebUI keeps it (User.getLanguage,
// User.setLanguage): userprofiles/<user>.lang with 0, 1 or 2
func TestUserLanguage(t *testing.T) {
	previous := userProfilesDir
	defer func() { userProfilesDir = previous }()
	userProfilesDir = filepath.Join(t.TempDir(), "userprofiles")

	s := NewServer(nil, nil)
	call := func(client *Client, m map[string]any) map[string]any {
		data, _ := json.Marshal(m)
		s.handleMessage(client, data)
		var answer map[string]any
		_ = json.Unmarshal(<-client.send, &answer)
		return answer
	}
	anna := &Client{send: make(chan []byte, 1), level: auth.LevelUser, user: "Anna"}
	if m := call(anna, map[string]any{"type": "getUserLanguage"}); m["language"] != 0.0 {
		t.Fatalf("default: %v", m)
	}
	if m := call(anna, map[string]any{"type": "setUserLanguage", "language": 2}); m["success"] != true {
		t.Fatalf("set: %v", m)
	}
	if data, _ := os.ReadFile(filepath.Join(userProfilesDir, "Anna.lang")); string(data) != "2\n" {
		t.Fatalf("file = %q", data)
	}
	if m := call(anna, map[string]any{"type": "getUserLanguage"}); m["language"] != 2.0 {
		t.Fatalf("after set: %v", m)
	}
	if m := call(anna, map[string]any{"type": "setUserLanguage", "language": 3}); m["code"] != "INVALID_VALUE" {
		t.Fatalf("expected INVALID_VALUE, got %v", m)
	}
	// Unknown contents are automatic, as the WebUI reads them
	_ = os.WriteFile(filepath.Join(userProfilesDir, "Anna.lang"), []byte("7\n"), 0o644)
	if m := call(anna, map[string]any{"type": "getUserLanguage"}); m["language"] != 0.0 {
		t.Fatalf("unknown: %v", m)
	}

	guest := &Client{send: make(chan []byte, 1), level: auth.LevelGuest, user: "Gast"}
	if m := call(guest, map[string]any{"type": "setUserLanguage", "language": 1}); m["code"] != "FORBIDDEN" {
		t.Fatalf("guest: %v", m)
	}
	// Without login there is no CCU user, nor a name that leaves the directory
	for _, user := range []string{"", "../etc/passwd", ".hidden"} {
		client := &Client{send: make(chan []byte, 1), level: auth.LevelAdmin, user: user}
		if m := call(client, map[string]any{"type": "setUserLanguage", "language": 1}); m["code"] != "NOT_SUPPORTED" {
			t.Fatalf("%q: %v", user, m)
		}
	}
}
