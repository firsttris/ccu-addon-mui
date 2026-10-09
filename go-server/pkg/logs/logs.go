// Package logs reads and writes the CCU's logging settings and serves its
// log files, as the WebUI's Zentralen-Wartung does (cp_maintenance.cgi:
// set_log_config, action_download_logfile).
package logs

import (
	"bufio"
	"ccu-addon-mui-server/pkg/atomicfile"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
)

// The levels the WebUI offers: rfd and hs485d (LOGLEVELS), the HmIP server
// (HMIP_LOGLEVELS) and ReGa (REGA_LOGLEVELS)
var (
	RFDLevels  = []int{1, 2, 4, 5}
	HmIPLevels = []string{"TRACE", "DEBUG", "INFO", "WARN", "ERROR"}
	RegaLevels = []int{0, 1, 2, 3}
)

// The files action_download_logfile puts together, oldest first
var logFiles = []string{"messages.1", "messages.0", "messages", "hmserver.log.1", "hmserver.log"}

var hostRegex = regexp.MustCompile(`^[A-Za-z0-9.:\[\]_-]{0,253}$`)

// A download link works this long, once
const downloadLifetime = 5 * time.Minute

// Settings are the logging settings in /etc/config/syslog
type Settings struct {
	Host   string
	RFD    int
	HS485D int
	Rega   int
	HmIP   string
}

type Service struct {
	// ConfigFile is /etc/config/syslog, Dir /var/log
	ConfigFile string
	Dir        string
	now        func() time.Time

	mu        sync.Mutex
	downloads map[string]time.Time
}

func New(configFile, dir string) *Service {
	return &Service{ConfigFile: configFile, Dir: dir, now: time.Now, downloads: map[string]time.Time{}}
}

// Available: only on the CCU itself, which has the syslog settings
func (s *Service) Available() bool {
	_, err := os.Stat(s.ConfigFile)
	return err == nil
}

// Read reads the settings; missing values as the WebUI assumes them
func (s *Service) Read() Settings {
	settings := Settings{RFD: 2, HS485D: 2, Rega: 2, HmIP: "ERROR"}
	f, err := os.Open(s.ConfigFile)
	if err != nil {
		return settings
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		key, value, ok := strings.Cut(strings.TrimSpace(scanner.Text()), "=")
		if !ok {
			continue
		}
		value = strings.Trim(value, `"'`)
		number, numErr := strconv.Atoi(value)
		switch {
		case key == "LOGHOST":
			settings.Host = value
		case key == "LOGLEVEL_RFD" && numErr == nil:
			settings.RFD = number
		case key == "LOGLEVEL_HS485D" && numErr == nil:
			settings.HS485D = number
		case key == "LOGLEVEL_REGA" && numErr == nil:
			settings.Rega = number
		case key == "LOGLEVEL_HMIP":
			settings.HmIP = value
		}
	}
	return settings
}

// Validate checks the settings against what the WebUI offers
func Validate(settings Settings) error {
	if !slices.Contains(RFDLevels, settings.RFD) || !slices.Contains(RFDLevels, settings.HS485D) {
		return fmt.Errorf("invalid BidCos log level")
	}
	if !slices.Contains(RegaLevels, settings.Rega) {
		return fmt.Errorf("invalid logic log level")
	}
	if !slices.Contains(HmIPLevels, settings.HmIP) {
		return fmt.Errorf("invalid HmIP log level")
	}
	if !hostRegex.MatchString(settings.Host) {
		return fmt.Errorf("invalid syslog server")
	}
	return nil
}

// Write writes the settings as set_log_config does: LOGHOST only when set
func (s *Service) Write(settings Settings) error {
	if err := Validate(settings); err != nil {
		return err
	}
	var b strings.Builder
	if settings.Host != "" {
		fmt.Fprintf(&b, "LOGHOST=%s\n", settings.Host)
	}
	fmt.Fprintf(&b, "LOGLEVEL_RFD=%d\nLOGLEVEL_HS485D=%d\nLOGLEVEL_REGA=%d\nLOGLEVEL_HMIP=%s\n",
		settings.RFD, settings.HS485D, settings.Rega, settings.HmIP)
	return atomicfile.Write(s.ConfigFile, []byte(b.String()), 0o644)
}

// Prepare returns the id of a download of the log files, valid once
func (s *Service) Prepare() string {
	buf := make([]byte, 16)
	_, _ = rand.Read(buf)
	id := hex.EncodeToString(buf)
	s.mu.Lock()
	defer s.mu.Unlock()
	for other, expires := range s.downloads {
		if s.now().After(expires) {
			delete(s.downloads, other)
		}
	}
	s.downloads[id] = s.now().Add(downloadLifetime)
	return id
}

// FileName is the name of the download, <hostname>-<date>.log
func (s *Service) FileName() string {
	host, err := os.Hostname()
	if err != nil || host == "" {
		host = "ccu"
	}
	return fmt.Sprintf("%s-%s.log", host, s.now().Format("2006-01-02"))
}

// ServeHTTP sends the log files once: GET <prefix>/<id>
func (s *Service) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:]
	s.mu.Lock()
	expires, ok := s.downloads[id]
	delete(s.downloads, id)
	s.mu.Unlock()
	if !ok || s.now().After(expires) {
		http.Error(w, "download not found or already used", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": s.FileName()}))
	w.Header().Set("Cache-Control", "no-store")
	for _, name := range logFiles {
		f, err := os.Open(filepath.Join(s.Dir, name))
		if err != nil {
			continue
		}
		fmt.Fprintf(w, "\r\n***** %s *****\r\n", name)
		_, _ = io.Copy(w, f)
		f.Close()
	}
}
