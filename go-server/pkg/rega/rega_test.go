package rega

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"ccu-addon-mui-server/pkg/config"
)

func TestSanitizeRegaValue(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{name: "boolean true", input: "true", want: "true"},
		{name: "boolean false", input: "false", want: "false"},
		{name: "integer", input: "-12", want: "-12"},
		{name: "float", input: "12.5", want: "12.5"},
		{name: "string quoted", input: "hello", want: "\"hello\""},
		{name: "string with umlaut and spaces", input: "Küche an", want: "\"Küche an\""},
		{name: "quote rejected", input: `a"); system.Exec("x`, wantErr: true},
		{name: "backslash rejected", input: `a\b`, wantErr: true},
		{name: "newline rejected", input: "a\nb", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := sanitizeRegaValue(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("sanitizeRegaValue(%q) = %q, want error", tt.input, got)
				}
				return
			}
			if err != nil || got != tt.want {
				t.Fatalf("sanitizeRegaValue(%q) = %q, %v, want %q", tt.input, got, err, tt.want)
			}
		})
	}
}

func TestSetDatapointRejectsInvalidIdentifiers(t *testing.T) {
	client := &Client{}

	_, _, err := client.SetDatapoint("HmIP-RF", "abc\";DROP", "STATE", "1")
	if err == nil {
		t.Fatal("expected error for invalid identifier, got nil")
	}
	if !strings.Contains(err.Error(), "invalid identifier") {
		t.Fatalf("expected invalid identifier error, got %v", err)
	}
}

func TestGetChannelsRejectsInvalidIDs(t *testing.T) {
	// No HTTP server: validation must fail before any request is made.
	client := &Client{}

	for _, id := range []string{`x"; system.Exec("reboot"); string y = "`, "", "12a"} {
		if _, err := client.GetChannels(id); err == nil || !strings.Contains(err.Error(), "invalid") {
			t.Fatalf("GetChannels(%q): expected validation error, got %v", id, err)
		}
	}
}

func TestGetChannelsSubstitutesIDAndParsesOutput(t *testing.T) {
	var gotScript string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		gotScript = string(body)
		_, _ = io.WriteString(w, "C\t1\tA:1\tSWITCH_VIRTUAL_RECEIVER\tHmIP-RF\tLicht\r\nD\tSTATE\t2\ttrue\r\n<xml><exec>/rega.exe</exec></xml>")
	}))
	defer ts.Close()

	client := &Client{cfg: &config.Config{}, httpClient: ts.Client(), baseURL: ts.URL}

	channels, err := client.GetChannels("1234")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(gotScript, `"1234"`) {
		t.Fatalf("expected id in script, got %s", gotScript)
	}
	if len(channels) != 1 || channels[0].Name != "Licht" || channels[0].Datapoints["STATE"] != true {
		t.Fatalf("unexpected channels: %+v", channels)
	}
}

func TestGetUserLevelRejectsInvalidNames(t *testing.T) {
	// No HTTP server: validation must fail before any request is made.
	client := &Client{}

	for _, name := range []string{"", `x"); system.Exec("reboot"); ("`, "a\\b", "a\nb"} {
		if _, err := client.GetUserLevel(name); err == nil || !strings.Contains(err.Error(), "invalid") {
			t.Fatalf("GetUserLevel(%q): expected validation error, got %v", name, err)
		}
	}
}

func TestGetUserLevel(t *testing.T) {
	var gotScript string
	output := "8"
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		gotScript = string(body)
		_, _ = io.WriteString(w, output+"<xml><exec>/rega.exe</exec></xml>")
	}))
	defer ts.Close()

	client := &Client{cfg: &config.Config{}, httpClient: ts.Client(), baseURL: ts.URL}

	level, err := client.GetUserLevel("Tristan Teufel")
	if err != nil || level != 8 {
		t.Fatalf("GetUserLevel = %d, %v", level, err)
	}
	if !strings.Contains(gotScript, `Get("Tristan Teufel")`) {
		t.Fatalf("expected the name in the script, got %s", gotScript)
	}

	// No such user: ReGa writes nothing
	output = ""
	if _, err := client.GetUserLevel("Nobody"); err == nil {
		t.Fatal("expected an error for an unknown user")
	}
}

func TestExecuteStripsXMLWrapper(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", r.Method)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "payload before xml<xml><anything/></xml>\n")
	}))
	defer ts.Close()

	client := &Client{
		cfg:        &config.Config{},
		httpClient: ts.Client(),
		baseURL:    ts.URL,
	}

	got, err := client.Execute("Write(\"x\")")
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if got != "payload before xml" {
		t.Fatalf("expected wrapper to be removed, got %q", got)
	}
}

func TestExecuteUsesBasicAuthWhenConfigured(t *testing.T) {
	const user = "alice"
	const pass = "secret"

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, p, ok := r.BasicAuth()
		if !ok {
			t.Fatal("expected basic auth header")
		}
		if u != user || p != pass {
			t.Fatalf("unexpected credentials user=%q pass=%q", u, p)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "ok")
	}))
	defer ts.Close()

	client := &Client{
		cfg:        &config.Config{CCUUser: user, CCUPass: pass},
		httpClient: ts.Client(),
		baseURL:    ts.URL,
	}

	got, err := client.Execute("Write(\"x\")")
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if got != "ok" {
		t.Fatalf("expected ok, got %q", got)
	}
}

func TestExecuteReturnsStatusError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer ts.Close()

	client := &Client{
		cfg:        &config.Config{},
		httpClient: ts.Client(),
		baseURL:    ts.URL,
	}

	_, err := client.Execute("Write(\"x\")")
	if err == nil {
		t.Fatal("expected status error, got nil")
	}
	if !strings.Contains(err.Error(), fmt.Sprintf("status %d", http.StatusBadGateway)) {
		t.Fatalf("expected status code in error, got %v", err)
	}
}

func TestSetDatapointReturnsPreviousValue(t *testing.T) {
	var gotScript string
	output := "OK\tfalse"
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		gotScript = string(body)
		_, _ = io.WriteString(w, output+"<xml><exec>/rega.exe</exec></xml>")
	}))
	defer ts.Close()
	client := &Client{cfg: &config.Config{}, httpClient: ts.Client(), baseURL: ts.URL}

	result, previous, err := client.SetDatapoint("HmIP-RF", "A:1", "STATE", "true")
	if err != nil || result != SetOK || previous != "false" {
		t.Fatalf("SetDatapoint = %q, %q, %v", result, previous, err)
	}
	if !strings.Contains(gotScript, `"HmIP-RF.A:1.STATE"`) || !strings.Contains(gotScript, "State(true)") {
		t.Fatalf("unexpected script: %s", gotScript)
	}

	output = "UNREACH"
	if result, _, err := client.SetDatapoint("HmIP-RF", "A:1", "STATE", "true"); err != nil || result != SetUnreach {
		t.Fatalf("SetDatapoint = %q, %v", result, err)
	}
}

func TestSetNameValidatesAndReturnsPreviousName(t *testing.T) {
	client := &Client{}
	for _, name := range []string{"", "  ", `a"b`, "a\\b", "a\nb", "a\tb", strings.Repeat("x", 101)} {
		if _, _, err := client.SetName("A:1", name); err == nil {
			t.Errorf("SetName(%q): expected an error", name)
		}
	}
	if _, _, err := client.SetName(`A"; system.Exec("x`, "ok"); err == nil {
		t.Error("expected an invalid address error")
	}

	var gotScript string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		gotScript = string(body)
		_, _ = io.WriteString(w, "OK\tHmIP-BSM 0001:1<xml></xml>")
	}))
	defer ts.Close()
	client = &Client{cfg: &config.Config{}, httpClient: ts.Client(), baseURL: ts.URL}
	result, previous, err := client.SetName("0001:1", "Licht Küche")
	if err != nil || result != SetOK || previous != "HmIP-BSM 0001:1" {
		t.Fatalf("SetName = %q, %q, %v", result, previous, err)
	}
	if !strings.Contains(gotScript, `"0001:1"`) || !strings.Contains(gotScript, `Name("Licht Küche")`) {
		t.Fatalf("unexpected script: %s", gotScript)
	}
}

func TestSetGroupMemberBuildsScript(t *testing.T) {
	var gotScript string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		gotScript = string(body)
		_, _ = io.WriteString(w, "OK<xml></xml>")
	}))
	defer ts.Close()
	client := &Client{cfg: &config.Config{}, httpClient: ts.Client(), baseURL: ts.URL}

	if result, err := client.SetGroupMember(1234, 5678, false); err != nil || result != SetOK {
		t.Fatalf("SetGroupMember = %q, %v", result, err)
	}
	if !strings.Contains(gotScript, "dom.GetObject(1234)") || !strings.Contains(gotScript, "groupObject.Remove(5678)") {
		t.Fatalf("unexpected script: %s", gotScript)
	}
}

// The text of a string variable stays text, even when it looks like a
// number or a boolean
func TestQuoteRegaText(t *testing.T) {
	for _, value := range []string{"007", "1.50", "true", "Hallo"} {
		got, err := quoteRegaText(value)
		if err != nil || got != `"`+value+`"` {
			t.Fatalf("quoteRegaText(%q) = %q, %v", value, got, err)
		}
	}
	if _, err := quoteRegaText(`a"b`); err == nil {
		t.Fatal("a quote must be rejected")
	}
}
