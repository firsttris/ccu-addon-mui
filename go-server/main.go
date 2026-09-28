package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

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
