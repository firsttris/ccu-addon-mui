package rules

import (
	"context"
	"testing"
	"time"
)

// A slow delivery doesn't hold up the caller (the CCU's event callback)
func TestQueueDoesNotBlock(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	release := make(chan struct{})
	delivered := make(chan string, 2)
	notify := Queue(ctx, func(r Rule) {
		<-release
		delivered <- r.Name
	})

	start := time.Now()
	notify(Rule{Name: "Wasser erkannt"})
	notify(Rule{Name: "Fenster offen"})
	if elapsed := time.Since(start); elapsed > 50*time.Millisecond {
		t.Fatalf("notify blocked for %v", elapsed)
	}
	close(release)
	for _, want := range []string{"Wasser erkannt", "Fenster offen"} {
		select {
		case got := <-delivered:
			if got != want {
				t.Fatalf("delivered %q, want %q", got, want)
			}
		case <-time.After(time.Second):
			t.Fatal("not delivered")
		}
	}
}

// A full queue drops instead of blocking
func TestQueueFullDrops(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	block := make(chan struct{})
	defer close(block)
	notify := Queue(ctx, func(Rule) { <-block })
	done := make(chan struct{})
	go func() {
		for i := 0; i < queueSize+10; i++ {
			notify(Rule{Name: "r"})
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("notify blocked on a full queue")
	}
}
