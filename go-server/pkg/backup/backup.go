// Package backup creates CCU backups (.sbk) with the WebUI's own backup
// routine and keeps them until the browser downloads them.
package backup

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// ErrInvalidCredentials means the WebUI didn't accept the password.
var ErrInvalidCredentials = errors.New("invalid credentials")

// A download waits this long for the browser; then the file is removed.
const downloadLifetime = 5 * time.Minute

// The WebUI writes a full backup of /usr/local, so creating one takes a
// while on a CCU with a long history.
const createTimeout = 5 * time.Minute

var (
	fileNameRegex  = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)
	sessionIDRegex = regexp.MustCompile(`^[A-Za-z0-9]+$`)
)

// Backup is a created backup, ready for download.
type Backup struct {
	ID       string
	FileName string
	Size     int64
	path     string
	expires  time.Time
}

type Service struct {
	// WebUI sessions for the heating groups, per user
	groupSessions     *groupSessions
	groupSessionsOnce sync.Once

	webUIURL   string
	httpClient *http.Client
	dir        string
	now        func() time.Time

	mu        sync.Mutex
	downloads map[string]*Backup
	uploads   map[string]*upload
}

// New creates backups via the WebUI at webUIURL and keeps them in dir.
// Backups and uploads a previous run left in dir are removed: dir is on the
// CCU's user partition, which a reboot doesn't clear.
func New(webUIURL, dir string) *Service {
	for _, pattern := range []string{"mui-backup-*.sbk", "mui-restore-*.sbk"} {
		leftovers, _ := filepath.Glob(filepath.Join(dir, pattern))
		for _, path := range leftovers {
			os.Remove(path)
		}
	}
	return &Service{
		webUIURL:   strings.TrimSuffix(webUIURL, "/"),
		httpClient: &http.Client{Timeout: createTimeout},
		dir:        dir,
		now:        time.Now,
		downloads:  map[string]*Backup{},
		uploads:    map[string]*upload{},
	}
}

// Create logs in to the WebUI as username, lets it create a backup and
// stores the file for one download.
func (s *Service) Create(username, password string) (*Backup, error) {
	s.removeExpired()

	sessionID, err := s.login(username, password)
	if err != nil {
		return nil, err
	}
	defer s.logout(sessionID)

	// The WebUI's own button. It looks for "sid=(@[A-Za-z0-9]*@)" in the raw
	// query, so the @ must not be escaped.
	if !sessionIDRegex.MatchString(sessionID) {
		return nil, fmt.Errorf("unexpected WebUI session id %q", sessionID)
	}
	resp, err := s.httpClient.Get(s.webUIURL + "/config/cp_security.cgi?sid=@" + sessionID + "@&action=create_backup")
	if err != nil {
		return nil, fmt.Errorf("CCU not reachable: %w", err)
	}
	defer resp.Body.Close()
	// Without a valid session the WebUI answers with an HTML page
	mediaType, _, _ := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	if resp.StatusCode != http.StatusOK || mediaType == "text/html" || mediaType == "text/plain" {
		return nil, fmt.Errorf("the CCU did not create a backup (status %d, %s)", resp.StatusCode, mediaType)
	}

	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		return nil, err
	}
	file, err := os.CreateTemp(s.dir, "mui-backup-*.sbk")
	if err != nil {
		return nil, err
	}
	size, err := io.Copy(file, resp.Body)
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err == nil && size == 0 {
		err = errors.New("the CCU sent an empty backup")
	}
	if err != nil {
		os.Remove(file.Name())
		return nil, err
	}

	id, err := randomID()
	if err != nil {
		os.Remove(file.Name())
		return nil, err
	}
	backup := &Backup{
		ID:       id,
		FileName: fileName(resp.Header.Get("Content-Disposition"), s.now()),
		Size:     size,
		path:     file.Name(),
		expires:  s.now().Add(downloadLifetime),
	}
	s.mu.Lock()
	s.downloads[id] = backup
	s.mu.Unlock()
	return backup, nil
}

// ServeHTTP sends a created backup once: GET <prefix>/<id>.
func (s *Service) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:]
	s.mu.Lock()
	backup, ok := s.downloads[id]
	if ok {
		delete(s.downloads, id)
	}
	s.mu.Unlock()
	if !ok || s.now().After(backup.expires) {
		if ok {
			os.Remove(backup.path)
		}
		http.Error(w, "backup not found or already downloaded", http.StatusNotFound)
		return
	}
	defer os.Remove(backup.path)

	file, err := os.Open(backup.path)
	if err != nil {
		http.Error(w, "backup not found", http.StatusNotFound)
		return
	}
	defer file.Close()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": backup.FileName}))
	w.Header().Set("Content-Length", fmt.Sprint(backup.Size))
	w.Header().Set("Cache-Control", "no-store")
	_, _ = io.Copy(w, file)
}

func (s *Service) removeExpired() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, backup := range s.downloads {
		if s.now().After(backup.expires) {
			os.Remove(backup.path)
			delete(s.downloads, id)
		}
	}
}

type rpcResponse struct {
	Result interface{} `json:"result"`
	Error  *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// The JSON API's code for a session without the rights the method needs,
// also an expired one (homematic.cgi checkPrivilegeLevel: "access denied")
const accessDeniedCode = 400

func (s *Service) login(username, password string) (string, error) {
	var login rpcResponse
	if err := s.call("Session.login", map[string]string{"username": username, "password": password}, &login); err != nil {
		return "", err
	}
	sessionID, ok := login.Result.(string)
	if login.Error != nil || !ok || sessionID == "" {
		return "", ErrInvalidCredentials
	}
	return sessionID, nil
}

// The CCU only allows a few sessions at a time
func (s *Service) logout(sessionID string) {
	var logout rpcResponse
	_ = s.call("Session.logout", map[string]string{"_session_id_": sessionID}, &logout)
}

func (s *Service) call(method string, params interface{}, result *rpcResponse) error {
	return s.callWith(s.httpClient, method, params, result)
}

func (s *Service) callWith(client *http.Client, method string, params interface{}, result *rpcResponse) error {
	body, _ := json.Marshal(map[string]interface{}{"version": "1.1", "method": method, "params": params})
	resp, err := client.Post(s.webUIURL+"/api/homematic.cgi", "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("CCU not reachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("CCU returned status %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(result)
}

// fileName takes the WebUI's name (<hostname>-<version>-<date>.sbk) when it
// sends a safe one.
func fileName(contentDisposition string, now time.Time) string {
	if _, params, err := mime.ParseMediaType(contentDisposition); err == nil {
		name := filepath.Base(params["filename"])
		if fileNameRegex.MatchString(name) && strings.HasSuffix(name, ".sbk") {
			return name
		}
	}
	return "ccu-backup-" + now.Format("2006-01-02-1504") + ".sbk"
}

func randomID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
