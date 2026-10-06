package websocket

import (
	"encoding/json"
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// The request types of protocol/schema.json (the contract the app's types
// are generated from) and the ones handleMessage and dispatch accept must be
// the same: a type added on one side only would be refused by the server,
// or be missing from the app's types and the schema check of the answers.
func TestDispatcherMatchesSchema(t *testing.T) {
	raw, err := os.ReadFile("../../../protocol/schema.json")
	if err != nil {
		t.Fatal(err)
	}
	var schema struct {
		Definitions map[string]struct {
			Properties map[string]struct {
				Const string `json:"const"`
			} `json:"properties"`
		} `json:"definitions"`
	}
	if err := json.Unmarshal(raw, &schema); err != nil {
		t.Fatal(err)
	}
	inSchema := map[string]bool{}
	for name, def := range schema.Definitions {
		if strings.HasSuffix(name, "Request") && def.Properties["type"].Const != "" {
			inSchema[def.Properties["type"].Const] = true
		}
	}

	source, err := os.ReadFile("websocket.go")
	if err != nil {
		t.Fatal(err)
	}
	// The case labels from handleMessage to the end of dispatch
	text := string(source)
	start := strings.Index(text, "func (s *Server) handleMessage(")
	end := strings.Index(text, "func (s *Server) handleSubscribe(")
	if start < 0 || end < start {
		t.Fatal("handleMessage/dispatch not found in websocket.go")
	}
	handled := map[string]bool{}
	for _, line := range regexp.MustCompile(`(?m)^\s*case (".*"):`).FindAllStringSubmatch(text[start:end], -1) {
		for _, quoted := range regexp.MustCompile(`"([^"]+)"`).FindAllStringSubmatch(line[1], -1) {
			handled[quoted[1]] = true
		}
	}
	if len(handled) < 100 || len(inSchema) < 100 {
		t.Fatalf("found too few types: %d handled, %d in the schema", len(handled), len(inSchema))
	}

	var missing, unknown []string
	for name := range inSchema {
		if !handled[name] {
			missing = append(missing, name)
		}
	}
	for name := range handled {
		if !inSchema[name] {
			unknown = append(unknown, name)
		}
	}
	sort.Strings(missing)
	sort.Strings(unknown)
	if len(missing) > 0 {
		t.Errorf("in the schema but not handled by the server: %v", missing)
	}
	if len(unknown) > 0 {
		t.Errorf("handled by the server but not in the schema: %v", unknown)
	}
}
