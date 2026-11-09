package rega

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"ccu-addon-mui-server/pkg/config"
)

func TestParseHistory(t *testing.T) {
	entries, total := parseHistory("N\t120\nH\t3\t2026-10-03 21:00:05\tchannel\tWohnzimmer Licht\tSTATE\ttrue\t\nH\t4\t2026-10-03 20:59:00\tsysvar\tAnwesenheit\t\t1\tanwesend\n")
	if total != 120 || len(entries) != 2 {
		t.Fatalf("got %d %+v", total, entries)
	}
	if e := entries[0]; e.Group != 3 || e.Kind != "channel" || e.Datapoint != "STATE" || e.Value != "true" || e.Text != "" {
		t.Fatalf("got %+v", e)
	}
	if e := entries[1]; e.Kind != "sysvar" || e.Text != "anwesend" {
		t.Fatalf("got %+v", e)
	}
}

func TestGetHistoryRange(t *testing.T) {
	c := &Client{}
	for _, r := range [][2]int{{-1, 10}, {0, 0}, {0, 501}} {
		if _, _, err := c.GetHistory(r[0], r[1], 0); err == nil {
			t.Errorf("expected an error for %v", r)
		}
	}
}

// ReGa stops a script at a runtime error and still answers 200 with what it
// wrote so far, here nothing: that is an error, not an empty protocol (#299)
func TestGetHistoryStoppedScript(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "<xml><exec>/rega.exe</exec></xml>")
	}))
	defer ts.Close()
	c := &Client{cfg: &config.Config{}, httpClient: ts.Client(), baseURL: ts.URL}
	if entries, total, err := c.GetHistory(0, 100, 0); err == nil {
		t.Fatalf("expected an error, got %d of %d", len(entries), total)
	}
}

func TestGetHistoryComplete(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "N\t1\nH\t1\t2026-11-08 12:00:00\tsysvar\tAnwesenheit\t\t1\tanwesend\n"+EndMarker+"\r\n<xml></xml>")
	}))
	defer ts.Close()
	c := &Client{cfg: &config.Config{}, httpClient: ts.Client(), baseURL: ts.URL}
	entries, total, err := c.GetHistory(0, 100, 0)
	if err != nil || total != 1 || len(entries) != 1 || entries[0].Text != "anwesend" {
		t.Fatalf("got %+v %d %v", entries, total, err)
	}
}

// web.webGetValueFromList exists only in the WebUI's pages; in a script sent
// to rega.exe it stops the script at the first enum system variable (#299)
func TestHistoryScriptWithoutWebUIFunctions(t *testing.T) {
	for _, line := range strings.Split(getHistoryScript, "\n") {
		if !strings.HasPrefix(strings.TrimSpace(line), "!") && strings.Contains(line, "web.") {
			t.Fatalf("get_history.tcl calls a function of the WebUI's pages: %s", line)
		}
	}
}
