package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/websocket"
	"ccu-addon-mui-server/pkg/xmlrpc"
)

func main() {
	cfg := config.Load()
	logger.LogStartupInfo(cfg)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	regaClient := rega.NewClient(cfg)
	wsServer := websocket.NewServer(cfg, regaClient)

	switch cfg.AuthMode {
	case "ccu":
		authenticator, err := auth.New(cfg.WebUIURL, cfg.AuthKeyFile)
		if err != nil {
			// Fail closed: without the key nobody could log in, and running
			// without authentication would expose all devices.
			logger.Error("❌ Failed to initialise authentication:", err)
			os.Exit(1)
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
		logger.Error("❌ Invalid AUTH_MODE, expected \"ccu\" or \"none\":", cfg.AuthMode)
		os.Exit(1)
	}
	rpcServer := xmlrpc.NewServer(cfg, wsServer.BroadcastToClients)

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

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)

	select {
	case sig := <-sigChan:
		logger.Info("🛑 Received signal:", sig)
	case <-ctx.Done():
		logger.Info("🛑 Context cancelled")
	}

	logger.Info("🛑 Shutting down...")

	// Stop the CCU registration loops before unregistering, so they can't
	// re-register in between.
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

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
}
