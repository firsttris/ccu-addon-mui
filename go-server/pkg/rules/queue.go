package rules

import (
	"context"

	"ccu-addon-mui-server/pkg/logger"
)

// queueSize is how many notifications wait for delivery; more are dropped
const queueSize = 64

// Queue returns a notify function for NewEngine that only queues the rule:
// deliver runs in its own goroutine until the context ends. OnEvent runs in
// the XML-RPC callback of rfd and the HmIP server, which send their events
// one after another; a Web Push (up to 15 s per subscription) there would
// hold up every event and the live display of all apps.
func Queue(ctx context.Context, deliver func(Rule)) func(Rule) {
	queue := make(chan Rule, queueSize)
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case r := <-queue:
				deliver(r)
			}
		}
	}()
	return func(r Rule) {
		select {
		case queue <- r:
		default:
			logger.Error("Rules: notification queue full, \"" + r.Name + "\" dropped")
		}
	}
}
