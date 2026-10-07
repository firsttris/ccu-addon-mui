package main

import (
	"context"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/diagrams"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/push"
	"ccu-addon-mui-server/pkg/rules"
	"ccu-addon-mui-server/pkg/tiles"
	"ccu-addon-mui-server/pkg/types"
	"ccu-addon-mui-server/pkg/websocket"
	"ccu-addon-mui-server/pkg/xmlrpc"
)

func main() {
	cfg := config.Load()
	if cfg.LogFile != "" {
		logger.RotateAt(cfg.LogFile, cfg.LogMaxBytes)
	}
	logger.LogStartupInfo(cfg)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		sig := <-sigChan
		logger.Info("🛑 Received signal:", sig)
		cancel()
	}()

	if err := run(ctx, cfg); err != nil {
		logger.Error("❌", err)
		os.Exit(1)
	}
}

// run starts the servers and keeps them running until ctx is cancelled or
// one of them fails.
func run(ctx context.Context, cfg *config.Config) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	wsServer := websocket.NewServer(cfg, nil)
	wsServer.SetAuditLog(audit.New(cfg.AuditLogFile))

	deviceRPC := newDeviceRPC(cfg)
	wsServer.SetDeviceRPC(deviceRPC)

	// What differs between a CCU and openccu-lite (main_ccu.go,
	// main_lite.go): the home model, the login, the system settings
	platform, err := setupPlatform(ctx, cfg, wsServer, deviceRPC)
	if err != nil {
		return err
	}

	// Push notifications about new alarms and service messages
	var ruleEngine *rules.Engine
	if store, err := push.OpenStore(cfg.PushFile); err != nil {
		logger.Error("Push notifications disabled:", err)
	} else if vapid, err := store.VAPID(cfg.PushSubject); err != nil {
		logger.Error("Push notifications disabled:", err)
	} else {
		// The alarms and service messages the apps' watch read anyway
		notifier := push.NewNotifier(store, vapid, wsServer.MessageSource(15*time.Second))
		wsServer.SetPush(store, notifier)
		go notifier.Run(ctx, 30*time.Second)

		// Notification rules: states of devices, checked on every event
		if ruleStore, err := rules.OpenStore(cfg.RulesFile); err != nil {
			logger.Error("Notification rules disabled:", err)
		} else {
			// Queued: OnEvent runs in the CCU's event callback
			ruleEngine = rules.NewEngine(ruleStore, deviceRPC, rules.Queue(ctx, func(r rules.Rule) {
				logger.Info("🔔 Rule \"" + r.Name + "\" notifies")
				notifier.NotifyRule(r.ID, r.Name, r.Text())
			}))
			if err := ruleEngine.KeepState(strings.TrimSuffix(cfg.RulesFile, ".json") + "-state.json"); err != nil {
				logger.Error("Rules: reading the state failed:", err)
			}
			wsServer.SetRules(ruleStore, ruleEngine)
			go ruleEngine.Run(ctx, 30*time.Second)
		}
	}

	// Diagrams record the values of their datapoints
	if store, err := diagrams.OpenStore(cfg.DiagramsFile); err != nil {
		logger.Error("Diagrams disabled:", err)
	} else {
		recorder := diagrams.NewRecorder(cfg.DiagramsDir)
		wsServer.SetDiagrams(store, recorder)
		go recorder.Run(ctx, 5*time.Minute, func(err error) { logger.Error("Failed to write diagram values:", err) })
		platform.diagramsRecording(ctx)
	}

	// Tile layouts and the tiles chosen for channels, the add-on's own on
	// every platform
	if store, err := tiles.Open(cfg.TilesFile); err != nil {
		logger.Error("Tile layouts disabled:", err)
	} else {
		wsServer.SetTiles(store)
	}

	// Alarms and service messages send no events either
	go wsServer.RunMessageWatch(ctx)

	handleEvent := func(event *types.CCUEvent) {
		platform.onEvent(event)
		wsServer.RecordEvent(event.Event.Channel, event.Event.Datapoint, event.Event.Value)
		wsServer.ServiceEvent(event.Event.Datapoint)
		if ruleEngine != nil {
			ruleEngine.OnEvent(event.Event.Channel, event.Event.Datapoint, event.Event.Value)
		}
		wsServer.BroadcastToClients(event)
	}
	// Descriptions change with new firmware or re-pairing
	deviceChanged := func(interfaceName, address string) {
		deviceAddress, _, _ := strings.Cut(address, ":")
		deviceRPC.Forget(interfaceName, deviceAddress)
	}
	// The platform's event stream (openccu-lite), or a callback server the
	// interface processes report to (init)
	var rpcServer *xmlrpc.Server
	if platform.events != nil {
		go platform.events(ctx, handleEvent, deviceChanged)
	} else {
		rpcServer = xmlrpc.NewServer(cfg, handleEvent)
		rpcServer.SetDeviceChangeHandler(deviceChanged)
	}

	go func() {
		if err := wsServer.Start(ctx); err != nil {
			logger.Error("Failed to start WebSocket server:", err)
			cancel()
		}
	}()

	if rpcServer != nil {
		go func() {
			if err := rpcServer.Start(ctx); err != nil {
				logger.Error("Failed to start XML-RPC server:", err)
				cancel()
			}
		}()
	}

	platform.started()

	<-ctx.Done()
	logger.Info("🛑 Shutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	// The registration loops stopped with ctx, so they can't re-register
	// after unregistering.
	if rpcServer != nil {
		if err := rpcServer.Unregister(shutdownCtx); err != nil {
			logger.Error("Error unregistering RPC clients:", err)
		}
	}

	if err := wsServer.Close(shutdownCtx); err != nil {
		logger.Error("Error closing WebSocket server:", err)
	}

	if rpcServer != nil {
		if err := rpcServer.Close(shutdownCtx); err != nil {
			logger.Error("Error closing RPC server:", err)
		}
	}

	logger.Info("✅ Shutdown complete")
	return nil
}

// platformHooks are what a platform (main_ccu.go, main_lite.go) adds to the
// common run: recording its own diagram series, seeing every event, and a
// step once the servers listen. Any may be nil.
type platformHooks struct {
	// events delivers the interfaces' events instead of the callback
	// server, until ctx ends
	events         func(ctx context.Context, handle func(*types.CCUEvent), deviceChanged func(iface, address string))
	recordDiagrams func(ctx context.Context)
	event          func(event *types.CCUEvent)
	start          func()
}

func (p platformHooks) diagramsRecording(ctx context.Context) {
	if p.recordDiagrams != nil {
		p.recordDiagrams(ctx)
	}
}

func (p platformHooks) onEvent(event *types.CCUEvent) {
	if p.event != nil {
		p.event(event)
	}
}

func (p platformHooks) started() {
	if p.start != nil {
		p.start()
	}
}
