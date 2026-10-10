// Package atomicfile writes the add-on's own files (rules, diagrams, push
// subscriptions, sessions, settings) so that a power cut never leaves a
// broken one: written next to it, flushed to the flash, then renamed over
// it. The CCU has no UPS; a half written push store would mean a new VAPID
// key and every browser's subscription lost.
package atomicfile

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

// Write replaces the file at path with data.
func Write(path string, data []byte, perm os.FileMode) error {
	if dir := filepath.Dir(path); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	tmp := path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, perm)
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		return err
	}
	// Without it, the rename can reach the flash before the data
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// WriteJSON writes v as indented JSON.
func WriteJSON(path string, v any, perm os.FileMode) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return Write(path, data, perm)
}

// ReadJSON reads the file into v. A missing or empty file leaves v as it
// is and is no error: nothing stored yet.
func ReadJSON(path string, v any) error {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) || (err == nil && len(data) == 0) {
		return nil
	}
	if err != nil {
		return err
	}
	return json.Unmarshal(data, v)
}
