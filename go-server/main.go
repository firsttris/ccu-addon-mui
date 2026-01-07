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
	// Load configuration
	cfg := config.Load()
	logger.LogStartupInfo(cfg)

	// Create context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize Rega client
	regaClient := rega.NewClient(cfg)

	// Initialize WebSocket server
	wsServer := websocket.NewServer(cfg, regaClient)

	// Initialize XML-RPC server and clients
	rpcServer := xmlrpc.NewServer(cfg, wsServer.BroadcastToClients)

	// Start WebSocket server
	go func() {
		if err := wsServer.Start(ctx); err != nil {
			logger.Error("Failed to start WebSocket server:", err)
			cancel()
		}
	}()

	// Start XML-RPC server
	go func() {
		if err := rpcServer.Start(ctx); err != nil {
			logger.Error("Failed to start XML-RPC server:", err)
			cancel()
		}
	}()

	// Test CCU connection after startup
	time.Sleep(1 * time.Second)
	if err := regaClient.TestConnection(); err != nil {
		logger.Error("CCU connection test failed:", err)
	}

	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)

	select {
	case sig := <-sigChan:
		logger.Info("🛑 Received signal:", sig)
	case <-ctx.Done():
		logger.Info("🛑 Context cancelled")
	}

	// Graceful shutdown
	logger.Info("🛑 Shutting down...")
	
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	// Unregister RPC clients
	if err := rpcServer.Unregister(shutdownCtx); err != nil {
		logger.Error("Error unregistering RPC clients:", err)
	}

	// Close WebSocket server
	if err := wsServer.Close(shutdownCtx); err != nil {
		logger.Error("Error closing WebSocket server:", err)
	}

	// Close RPC server
	if err := rpcServer.Close(shutdownCtx); err != nil {
		logger.Error("Error closing RPC server:", err)
	}

	logger.Info("✅ Shutdown complete")
}
