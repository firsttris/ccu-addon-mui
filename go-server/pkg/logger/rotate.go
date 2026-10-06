package logger

import (
	"io"
	"log"
	"os"
	"sync"
)

// The server's log is its stderr, which rc.d/mui appends to
// /var/log/mui-websocket-server.log. /var/log is a RAM disk on the CCU, and
// rc.d/mui only turns the log over on a start: running for months, the log
// would grow until memory runs out. So the server turns it over itself,
// keeping one old log, by copying it to <path>.old and emptying it. The
// file stays the same, so the shell's redirection (opened for appending)
// goes on writing at its start, and so does a crash message of the Go
// runtime.

// checkEvery: the size is looked at after this many bytes of log
const checkEvery = 64 << 10

type rotatingOutput struct {
	mu      sync.Mutex
	out     io.Writer
	path    string
	max     int64
	written int64
}

// RotateAt turns the log at path over when it has grown beyond maxBytes.
func RotateAt(path string, maxBytes int64) {
	r := &rotatingOutput{out: os.Stderr, path: path, max: maxBytes}
	r.rotate()
	log.SetOutput(r)
}

func (r *rotatingOutput) Write(p []byte) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	n, err := r.out.Write(p)
	r.written += int64(n)
	if r.written >= checkEvery {
		r.written = 0
		r.rotate()
	}
	return n, err
}

func (r *rotatingOutput) rotate() {
	info, err := os.Stat(r.path)
	if err != nil || info.Size() <= r.max {
		return
	}
	data, err := os.ReadFile(r.path)
	if err != nil {
		return
	}
	if err := os.WriteFile(r.path+".old", data, 0o644); err != nil {
		return
	}
	_ = os.Truncate(r.path, 0)
}
