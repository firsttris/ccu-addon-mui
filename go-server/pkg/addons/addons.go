// Package addons lists and operates the CCU add-ons, as the WebUI's
// Zusatzsoftware dialog does (config/cp_software.cgi): every executable
// script in /etc/config/rc.d describes itself with "info" and runs the
// operations it lists.
package addons

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strings"
	"time"
)

// Addon is what an add-on script says about itself.
type Addon struct {
	// The script's file name in the rc.d directory
	ID      string `json:"id"`
	Name    string `json:"name"`
	Version string `json:"version,omitempty"`
	// Info lines without HTML
	Info []string `json:"info,omitempty"`
	// Where to check for a new version (cmd=check_version) and download it
	UpdateURL string `json:"updateUrl,omitempty"`
	ConfigURL string `json:"configUrl,omitempty"`
	// The operations the script offers that the WebUI knows
	Operations []string `json:"operations"`
	// This add-on itself, which can't uninstall itself from here
	Self bool `json:"self,omitempty"`
}

// The operations the WebUI offers (OPERATIONS in cp_software.cgi)
var knownOperations = []string{"restart", "uninstall"}

// Service reads and operates the add-ons in Dir.
type Service struct {
	Dir string
	// The rc.d script of this add-on
	SelfID string
	// Base of relative update URLs (the WebUI)
	WebUIURL string
	Timeout  time.Duration
	client   *http.Client
}

func New(dir, selfID, webUIURL string) *Service {
	return &Service{Dir: dir, SelfID: selfID, WebUIURL: webUIURL, Timeout: 10 * time.Second, client: &http.Client{Timeout: 5 * time.Second}}
}

var lineRegex = regexp.MustCompile(`^([^:]+): (.*)$`)
var tagRegex = regexp.MustCompile(`<[^>]*>`)

// run calls the script with one argument and returns its output
func (s *Service) run(script, arg string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), s.Timeout)
	defer cancel()
	return exec.CommandContext(ctx, script, arg).Output()
}

// info merges "info.<lang>" and "info" as get_info does: lines "Key: value",
// repeated keys appended
func (s *Service) info(script, lang string) map[string][]string {
	values := map[string][]string{}
	for _, arg := range []string{"info." + lang, "info"} {
		output, err := s.run(script, arg)
		if err != nil && len(output) == 0 {
			continue
		}
		scanner := bufio.NewScanner(bytes.NewReader(output))
		for scanner.Scan() {
			if m := lineRegex.FindStringSubmatch(strings.TrimRight(scanner.Text(), "\r")); m != nil {
				values[m[1]] = append(values[m[1]], strings.TrimSpace(m[2]))
			}
		}
		if len(values) > 0 {
			// info.<lang> answered: "info" would only repeat it
			break
		}
	}
	return values
}

// List returns the add-ons in the language (de or en), sorted by name.
func (s *Service) List(lang string) []Addon {
	if lang != "en" {
		lang = "de"
	}
	addons := []Addon{}
	scripts, _ := filepath.Glob(filepath.Join(s.Dir, "*"))
	for _, script := range scripts {
		stat, err := os.Stat(script)
		if err != nil || stat.IsDir() || stat.Mode()&0o111 == 0 {
			continue
		}
		values := s.info(script, lang)
		if len(values["Name"]) == 0 {
			continue
		}
		addon := Addon{ID: filepath.Base(script), Name: values["Name"][0], Operations: []string{}}
		addon.Self = addon.ID == s.SelfID
		if v := values["Version"]; len(v) > 0 {
			addon.Version = v[0]
		}
		if v := values["Update"]; len(v) > 0 {
			addon.UpdateURL = v[0]
		}
		if v := values["Config-Url"]; len(v) > 0 {
			addon.ConfigURL = v[0]
		}
		for _, line := range values["Info"] {
			// Many scripts repeat their name as the first info line
			if text := strings.TrimSpace(tagRegex.ReplaceAllString(line, "")); text != "" && text != addon.Name {
				addon.Info = append(addon.Info, text)
			}
		}
		for _, field := range values["Operations"] {
			for _, op := range strings.Fields(field) {
				if slices.Contains(knownOperations, op) && !slices.Contains(addon.Operations, op) {
					addon.Operations = append(addon.Operations, op)
				}
			}
		}
		addons = append(addons, addon)
	}
	sort.Slice(addons, func(i, j int) bool { return strings.ToLower(addons[i].Name) < strings.ToLower(addons[j].Name) })
	return addons
}

// Offers says whether the add-on offers the operation.
func (s *Service) Offers(id, operation string) bool {
	for _, a := range s.List("de") {
		if a.ID == id {
			return slices.Contains(a.Operations, operation)
		}
	}
	return false
}

// ErrNotFound: no such add-on, or it doesn't offer the operation
var ErrNotFound = fmt.Errorf("not found")

// Run runs an operation the add-on offers, as action_operation does; after
// uninstall the script is removed. This add-on can't uninstall itself.
func (s *Service) Run(id, operation string) (name string, err error) {
	if id == "" || id != filepath.Base(id) || strings.HasPrefix(id, ".") {
		return "", fmt.Errorf("invalid add-on")
	}
	var addon *Addon
	for _, a := range s.List("de") {
		if a.ID == id {
			addon = &a
			break
		}
	}
	if addon == nil || !slices.Contains(addon.Operations, operation) {
		return "", ErrNotFound
	}
	if addon.Self && operation == "uninstall" {
		return "", fmt.Errorf("invalid: this add-on can't uninstall itself")
	}
	script := filepath.Join(s.Dir, id)
	if _, err := s.run(script, operation); err != nil {
		return addon.Name, fmt.Errorf("%s failed: %w", operation, err)
	}
	if operation == "uninstall" {
		if err := os.RemoveAll(script); err != nil {
			return addon.Name, err
		}
	}
	return addon.Name, nil
}

// CheckUpdate asks the add-on's update URL for the newest version
// (cmd=check_version), as the WebUI's getVersion does; a relative URL
// points to the WebUI.
func (s *Service) CheckUpdate(updateURL, version string) (string, error) {
	u, err := url.Parse(updateURL)
	if err != nil || updateURL == "" {
		return "", fmt.Errorf("invalid update URL")
	}
	if !u.IsAbs() {
		base, err := url.Parse(s.WebUIURL)
		if err != nil {
			return "", err
		}
		u = base.ResolveReference(u)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("invalid update URL")
	}
	query := u.Query()
	query.Set("cmd", "check_version")
	query.Set("version", version)
	u.RawQuery = query.Encode()
	resp, err := s.client.Get(u.String())
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("update check returned status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 200))
	if err != nil {
		return "", err
	}
	latest := strings.TrimSpace(tagRegex.ReplaceAllString(string(body), ""))
	if len(latest) > 40 || strings.ContainsAny(latest, "\n\r") {
		return "", fmt.Errorf("unexpected answer from the update check")
	}
	return latest, nil
}
