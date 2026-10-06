package logger

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestLogIsTurnedOverWhenTooBig(t *testing.T) {
	path := filepath.Join(t.TempDir(), "server.log")
	// Opened for appending, like the shell's >> in rc.d/mui
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	r := &rotatingOutput{out: file, path: path, max: 100 << 10}

	line := bytes.Repeat([]byte("x"), 1023)
	line = append(line, '\n')
	for i := 0; i < 200; i++ {
		if _, err := r.Write(line); err != nil {
			t.Fatal(err)
		}
	}
	current, _ := os.Stat(path)
	old, err := os.Stat(path + ".old")
	if err != nil {
		t.Fatalf("no old log: %v", err)
	}
	if current.Size() > 100<<10+checkEvery || old.Size() <= 100<<10 {
		t.Fatalf("log not turned over: current %d, old %d", current.Size(), old.Size())
	}
	// Writing goes on at the start of the emptied file
	if _, err := file.Write([]byte("after\n")); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(path)
	if !bytes.HasSuffix(data, []byte("after\n")) || bytes.Contains(data[:min(len(data), 16)], []byte{0}) {
		t.Fatalf("unexpected log content at %d bytes", len(data))
	}
}
