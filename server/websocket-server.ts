#!/usr/bin/env node

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import * as xmlrpc from 'homematic-xmlrpc';
import * as rega from 'homematic-rega';

// Configuration
const WS_PORT = 8088;
const RPC_PORT = 2001; // BidCos-RF
const HMIP_PORT = 2010; // HmIP-RF
const CCU_HOST = 'localhost';

// Types
interface CCUEvent {
  event: {
    interface: string;
    channel: string;
    datapoint: string;
    value: any;
    timestamp: string;
  };
}

interface RPCClient {
  methodCall(
    method: string,
    params: any[],
    callback: (err: Error | null, result?: any) => void,
  ): void;
}

// Create HTTP server for WebSocket
const server = createServer();
const wss = new WebSocketServer({ server });

// Store connected clients
const clients = new Set<WebSocket>();

// CCU Rega instance
const regaConnection = new (rega as any).Rega({
  host: CCU_HOST,
  port: 8181,
});

// RPC Server to receive events from CCU
let rpcServer: any;
const rpcClients: Record<string, RPCClient> = {};

// Initialize RPC connections
function initRPC(): void {
  // Create RPC server to receive events
  rpcServer = (xmlrpc as any).createServer({ host: '127.0.0.1', port: 9099 });

  rpcServer.on(
    'system.multicall',
    function (
      _method: string,
      params: any[],
      callback: (err: null | Error, result?: string) => void,
    ) {
      params[0].forEach(function (event: any) {
        handleCCUEvent(
          event.params[0],
          event.params[1],
          event.params[2],
          event.params[3],
        );
      });
      callback(null, '');
    },
  );

  rpcServer.on(
    'event',
    function (
      _err: Error,
      params: any[],
      callback: (err: null | Error, result?: string) => void,
    ) {
      handleCCUEvent(params[0], params[1], params[2], params[3]);
      callback(null, '');
    },
  );

  rpcServer.on(
    'newDevices',
    function (
      _err: Error,
      _params: any[],
      callback: (err: null | Error, result?: string) => void,
    ) {
      console.log('New devices detected');
      callback(null, '');
    },
  );

  rpcServer.on(
    'deleteDevices',
    function (
      _err: Error,
      _params: any[],
      callback: (err: null | Error, result?: string) => void,
    ) {
      console.log('Devices deleted');
      callback(null, '');
    },
  );

  // Connect to CCU interfaces
  connectToCCU('BidCos-RF', RPC_PORT);
  connectToCCU('HmIP-RF', HMIP_PORT);

  console.log('RPC Server started on port 9099');
}

function connectToCCU(interfaceName: string, port: number): void {
  const client = (xmlrpc as any).createClient({ host: CCU_HOST, port: port });
  rpcClients[interfaceName] = client;

  // Register callback URL
  client.methodCall(
    'init',
    ['http://127.0.0.1:9099', interfaceName],
    function (err: Error | null) {
      if (err) {
        console.error(`Failed to initialize ${interfaceName}:`, err.message);
      } else {
        console.log(`Connected to ${interfaceName} on port ${port}`);
      }
    },
  );
}

// Handle events from CCU
function handleCCUEvent(
  interfaceName: string,
  address: string,
  datapoint: string,
  value: any,
): void {
  const event = {
    event: {
      interface: interfaceName,
      channel: address,
      datapoint: datapoint,
      value: value,
      timestamp: new Date().toISOString(),
    },
  };

  // Broadcast to all connected WebSocket clients
  broadcastToClients(event);
}

// Broadcast message to all WebSocket clients
function broadcastToClients(data: CCUEvent): void {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Execute Rega script
async function executeRegaScript(script: string): Promise<any> {
  return new Promise((resolve, reject) => {
    regaConnection.script(script, function (err: Error | null, result: any) {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

// WebSocket server
wss.on('connection', (ws: WebSocket) => {
  console.log('New WebSocket client connected');
  clients.add(ws);

  ws.on('message', async (message: any) => {
    try {
      const messageStr = message.toString();

      // Try to parse as JSON first (for future compatibility)
      let isJson = false;
      let data: any;
      try {
        data = JSON.parse(messageStr);
        isJson = true;
      } catch {
        // Not JSON, treat as plain TCL script (Node-RED compatible)
        isJson = false;
      }

      if (isJson) {
        // Handle JSON messages (new format)
        if (data.type === 'script') {
          const result = await executeRegaScript(data.script);
          ws.send(
            JSON.stringify({
              type: 'script_response',
              result: result,
              requestId: data.requestId,
            }),
          );
        } else if (data.type === 'setValue') {
          const { address, datapoint, value } = data;
          const script = `dom.GetObject("${address}").DPByHssDP("${datapoint}").State(${value});`;
          const result = await executeRegaScript(script);
          ws.send(
            JSON.stringify({
              type: 'setValue_response',
              result: result,
              requestId: data.requestId,
            }),
          );
        }
      } else {
        // Handle plain TCL script (Node-RED compatible)
        const result = await executeRegaScript(messageStr);
        ws.send(JSON.stringify(result));
      }
    } catch (err) {
      console.error('Error handling message:', err);
      ws.send(
        JSON.stringify({
          type: 'error',
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (err: Error) => {
    console.error('WebSocket error:', err);
    clients.delete(ws);
  });
});

// Start WebSocket server
server.listen(WS_PORT, () => {
  console.log(`WebSocket Server running on port ${WS_PORT}`);
  console.log(`WebSocket URL: ws://localhost:${WS_PORT}`);
});

// Initialize RPC
initRPC();

// Cleanup on exit
process.on('SIGTERM', () => {
  console.log('Shutting down...');

  // Unregister from CCU interfaces
  Object.keys(rpcClients).forEach((interfaceName) => {
    rpcClients[interfaceName].methodCall(
      'init',
      ['http://127.0.0.1:9099', ''],
      (err) => {
        if (err)
          console.error(`Failed to unregister ${interfaceName}:`, err.message);
      },
    );
  });

  wss.close();
  server.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  process.exit(0);
});
