package main

import (
	"ccu-addon-mui-server/pkg/addons"
	"context"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/backup"
	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/logs"
	"ccu-addon-mui-server/pkg/push"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/websocket"
	"ccu-addon-mui-server/pkg/xmlrpc"
)

func main() {
	cfg := config.Load()
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

	regaClient := rega.NewClient(cfg)
	wsServer := websocket.NewServer(cfg, regaClient)

	switch cfg.AuthMode {
	case "ccu":
		authenticator, err := auth.New(cfg.WebUIURL, cfg.AuthKeyFile)
		if err != nil {
			// Fail closed: without the key nobody could log in, and running
			// without authentication would expose all devices.
			return fmt.Errorf("failed to initialise authentication: %w", err)
		}
		if err := authenticator.EnableSessions(cfg.SessionsFile); err != nil {
			return fmt.Errorf("failed to load the logged-in devices: %w", err)
		}
		authenticator.SetLevelFunc(func(username string) (string, error) {
			level, err := regaClient.GetUserLevel(username)
			if err != nil {
				logger.Info(fmt.Sprintf("⚠️ Could not read the user level of %q: %v", username, err))
				return auth.LevelUnknown, err
			}
			return auth.LevelFromCCU(level), nil
		})
		wsServer.SetAuthenticator(authenticator)
		logger.Info("🔒 Authentication: CCU users (" + cfg.WebUIURL + ")")
	case "none":
		logger.Info("⚠️ Authentication disabled (AUTH_MODE=none): everyone on the network can control all devices")
	default:
		return fmt.Errorf("invalid AUTH_MODE %q, expected \"ccu\" or \"none\"", cfg.AuthMode)
	}

	wsServer.SetAuditLog(audit.New(cfg.AuditLogFile))
	wsServer.SetBackup(backup.New(cfg.WebUIURL, cfg.BackupDir))

	deviceRPC, err := ccurpc.New(cfg)
	if err != nil {
		return fmt.Errorf("failed to create the XML-RPC client: %w", err)
	}
	wsServer.SetDeviceRPC(deviceRPC)

	// The add-ons; this one's rc.d script is "mui" (addon_installer/rc.d)
	wsServer.SetAddons(addons.New(cfg.AddonsDir, "mui", cfg.WebUIURL))
	wsServer.SetLogs(logs.New(cfg.SyslogConfig, cfg.LogDir))

	// Push notifications about new alarms and service messages
	if store, err := push.OpenStore(cfg.PushFile); err != nil {
		logger.Error("Push notifications disabled:", err)
	} else if vapid, err := store.VAPID(cfg.PushSubject); err != nil {
		logger.Error("Push notifications disabled:", err)
	} else {
		notifier := push.NewNotifier(store, vapid, regaClient)
		wsServer.SetPush(store, notifier)
		go notifier.Run(ctx, 30*time.Second)
	}

	rpcServer := xmlrpc.NewServer(cfg, wsServer.BroadcastToClients)
	// Descriptions change with new firmware or re-pairing
	rpcServer.SetDeviceChangeHandler(func(interfaceName, address string) {
		deviceAddress, _, _ := strings.Cut(address, ":")
		deviceRPC.Forget(interfaceName, deviceAddress)
	})

	go func() {
		if err := wsServer.Start(ctx); err != nil {
			logger.Error("Failed to start WebSocket server:", err)
			cancel()
		}
	}()

	go func() {
		if err := rpcServer.Start(ctx); err != nil {
			logger.Error("Failed to start XML-RPC server:", err)
			cancel()
		}
	}()

	if err := regaClient.TestConnection(); err != nil {
		logger.Error("CCU connection test failed:", err)
	}

	<-ctx.Done()
	logger.Info("🛑 Shutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	// The registration loops stopped with ctx, so they can't re-register
	// after unregistering.
	if err := rpcServer.Unregister(shutdownCtx); err != nil {
		logger.Error("Error unregistering RPC clients:", err)
	}

	if err := wsServer.Close(shutdownCtx); err != nil {
		logger.Error("Error closing WebSocket server:", err)
	}

	if err := rpcServer.Close(shutdownCtx); err != nil {
		logger.Error("Error closing RPC server:", err)
	}

	logger.Info("✅ Shutdown complete")
	return nil
}
