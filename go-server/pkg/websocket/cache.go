package websocket

import (
	"sync"
	"time"
)

// cached keeps the last value read, e.g. the answer of a ReGa script.
// Callers wait for a read already running instead of starting their own;
// a failed read is not kept.
type cached[T any] struct {
	mu    sync.Mutex
	at    time.Time
	value T
}

// get returns the value if it is younger than maxAge, else reads it (maxAge
// 0: always).
func (c *cached[T]) get(maxAge time.Duration, read func() (T, error)) (T, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if maxAge > 0 && !c.at.IsZero() && time.Since(c.at) < maxAge {
		return c.value, nil
	}
	value, err := read()
	if err != nil {
		var zero T
		return zero, err
	}
	c.value, c.at = value, time.Now()
	return value, nil
}
