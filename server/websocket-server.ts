#!/usr/bin/env node

import { logStartupInfo, log } from './lib/logger';
import {
  createRegaConnection,
  executeRegaScript,
  testCCUConnection,
} from './lib/rega';
import { initRPC, unregisterRPCClients } from './lib/xmlrpc';
import { createWebSocketServer } from './lib/websocket';

// Main application setup
const main = async (): Promise<void> => {
  logStartupInfo();

  // Initialize Rega connection
  const regaConnection = createRegaConnection();
  const executeScript = executeRegaScript(regaConnection);

  // Initialize WebSocket server
  const wsServer = createWebSocketServer(executeScript);

  // Initialize RPC with event handler
  const { clients: rpcClients } = initRPC(wsServer.broadcastToClients);

  // Start WebSocket server
  await wsServer.start();

  // Test CCU connection after startup
  setTimeout(() => {
    testCCUConnection(executeScript);
  }, 1000);

  // Cleanup on exit
  const shutdown = (): void => {
    log.info('� Shutting down...');
    unregisterRPCClients(rpcClients);
    wsServer.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', () => {
    log.info('� Shutting down (SIGINT)...');
    process.exit(0);
  });
};

// Start the application
main().catch((err) => {
  log.error('❌ Fatal error:', err);
  process.exit(1);
});
