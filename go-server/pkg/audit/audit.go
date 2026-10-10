// Package audit records every change made through the add-on (who, when,
// what, before and after) in a small rotating file, for troubleshooting
// ("why did the heating go off?") and trust.
package audit

import (
	"encoding/json"
	"os"
	"sync"
	"time"
)

// Entry is one change.
type Entry struct {
	Time   time.Time `json:"time"`
	User   string    `json:"user,omitempty"`
	Action string    `json:"action"`
	// Target, e.g. "HmIP-RF.0001D3C99C3C93:1.STATE"
	Target   string `json:"target"`
	Previous any    `json:"previous,omitempty"`
	Value    any    `json:"value"`
	// Result is "OK" or why the change was not made
	Result string `json:"result"`
}

// Log appends entries as JSON lines. When the file exceeds maxSize it is
// renamed to <file>.1 (replacing the previous one), so at most twice
// maxSize is kept: the CCU's flash is small.
type Log struct {
	mu      sync.Mutex
	path    string
	maxSize int64
	now     func() time.Time
}

const defaultMaxSize = 512 << 10

// New returns a log writing to path; an empty path disables logging.
func New(path string) *Log {
	return &Log{path: path, maxSize: defaultMaxSize, now: time.Now}
}

// Record writes an entry. Errors are returned but must not stop the
// change itself: the log is a help, not a gate.
func (l *Log) Record(entry Entry) error {
	if l == nil || l.path == "" {
		return nil
	}
	if entry.Time.IsZero() {
		entry.Time = l.now()
	}
	line, err := json.Marshal(entry)
	if err != nil {
		return err
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	if info, err := os.Stat(l.path); err == nil && info.Size()+int64(len(line))+1 > l.maxSize {
		if err := os.Rename(l.path, l.path+".1"); err != nil {
			return err
		}
	}
	f, err := os.OpenFile(l.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.Write(append(line, '\n'))
	return err
}
