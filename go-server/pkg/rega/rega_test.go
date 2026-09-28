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

	_, err := client.SetDatapoint("HmIP-RF", "abc\";DROP", "STATE", "1")
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
