#!/usr/bin/env node

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import binrpc from 'binrpc';
import xmlrpc from 'homematic-xmlrpc';
import Rega from 'homematic-rega';

// Configuration
const WS_PORT = 8088;
const BCRF_XMLRPC_PORT = 2001; // BidCos-RF XMLRPC (always available)
const BCRF_BINRPC_PORT = 2000; // BidCos-RF BinRPC (only on CCU)
const HMIP_PORT = 2010; // HmIP-RF BinRPC (always)
const CCU_HOST = process.env.CCU_HOST || 'localhost';
const CCU_USER = process.env.CCU_USER;
const CCU_PASS = process.env.CCU_PASS;

// Check if we're running on the CCU itself
const IS_LOCAL = CCU_HOST === 'localhost' || CCU_HOST === '127.0.0.1';

// The IP address of this server (where events should be sent to)
// IMPORTANT: This must be reachable from the CCU!
// Default: 127.0.0.1 for CCU3, override with CALLBACK_HOST for external servers
const CALLBACK_HOST = process.env.CALLBACK_HOST || '127.0.0.1';
const RPC_SERVER_PORT = parseInt(process.env.RPC_SERVER_PORT || '9099');

// Port 8183 is used for local connections on CCU (no auth required for localhost)
// Port 8181 is used for remote connections (auth required)
const REGA_PORT = CCU_HOST === 'localhost' ? 8183 : 8181;

console.log(`CCU Host: ${CCU_HOST}`);
console.log(`Rega Port: ${REGA_PORT}`);
console.log(`CCU Auth: ${CCU_USER ? 'enabled' : 'disabled'}`);
console.log(`Callback Host: ${CALLBACK_HOST}`);
console.log(`RPC Server Port: ${RPC_SERVER_PORT}`);
console.log(`Running locally on CCU: ${IS_LOCAL}`);

// Types
interface CCUEvent {
  event: {
    interface: string;
    channel: string;
    datapoint: string;
    value: unknown;
    timestamp: string;
  };
}

interface ScriptMessage {
  type: 'script';
  script: string;
  requestId?: string;
}

interface SetValueMessage {
  type: 'setValue';
  address: string;
  datapoint: string;
  value: unknown;
  requestId?: string;
}

type WebSocketMessage = ScriptMessage | SetValueMessage;

// Create HTTP server for WebSocket
const server = createServer();
const wss = new WebSocketServer({ server });

// Store connected clients
const clients = new Set<WebSocket>();

// CCU Rega instance
const regaConnection = new Rega({
  host: CCU_HOST,
  port: REGA_PORT,
  ...(CCU_USER && CCU_PASS
    ? {
        auth: true,
        user: CCU_USER,
        pass: CCU_PASS,
      }
    : {}),
});

// Test CCU connection
async function testCCUConnection(): Promise<void> {
  console.log(`Testing connection to CCU Rega at ${CCU_HOST}:${REGA_PORT}...`);
  try {
    await executeRegaScript('Write("Hello from WebSocket Server");');
    console.log('✅ CCU Rega connection successful');
  } catch (err) {
    console.error(
      '❌ CCU Rega connection failed:',
      err instanceof Error ? err.message : String(err),
    );
    console.error(`Make sure ${CCU_HOST}:${REGA_PORT} is reachable`);
  }
}

// RPC Server to receive events from CCU
let rpcServer: ReturnType<typeof binrpc.createServer>;
const rpcClients: Record<
  string,
  | ReturnType<typeof binrpc.createClient>
  | ReturnType<typeof xmlrpc.createClient>
> = {};

// Initialize RPC connections
function initRPC(): void {
  console.log('📡 Initializing BinRPC server...');
  console.log(`   Binding to 0.0.0.0:${RPC_SERVER_PORT}`);
  console.log(`   CCU will connect to ${CALLBACK_HOST}:${RPC_SERVER_PORT}`);

  // Create BinRPC server to receive events
  rpcServer = binrpc.createServer({ host: '0.0.0.0', port: RPC_SERVER_PORT });

  console.log(`✅ BinRPC server created on 0.0.0.0:${RPC_SERVER_PORT}`);

  rpcServer.on(
    'system.multicall',
    function (
      _err: null,
      params: unknown[],
      callback: (err: null | Error, result?: string) => void,
    ) {
      console.log(
        '📨 Received system.multicall with',
        (params[0] as Array<unknown>).length,
        'events',
      );
      (
        params[0] as Array<{ params: [string, string, string, unknown] }>
      ).forEach(function (event) {
        console.log('  -> Event params:', event.params);
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
      _err: null,
      params: unknown[],
      callback: (err: null | Error, result?: string) => void,
    ) {
      console.log('📨 Received single event:', params);
      handleCCUEvent(
        params[0] as string,
        params[1] as string,
        params[2] as string,
        params[3],
      );
      callback(null, '');
    },
  );

  rpcServer.on(
    'newDevices',
    function (
      _err: null,
      params: unknown[],
      callback: (err: null | Error, result?: string) => void,
    ) {
      console.log('🆕 New devices detected:', params);
      callback(null, '');
    },
  );

  rpcServer.on(
    'deleteDevices',
    function (
      _err: null,
      params: unknown[],
      callback: (err: null | Error, result?: string) => void,
    ) {
      console.log('🗑️  Devices deleted:', params);
      callback(null, '');
    },
  );

  // Connect to CCU interfaces
  // BidCos-RF: Use BinRPC when local (port 2000), XMLRPC when remote (port 2001)
  // HmIP-RF: Always use BinRPC (port 2010)
  if (IS_LOCAL) {
    connectToCCU('BidCos-RF', BCRF_BINRPC_PORT, 'binrpc');
  } else {
    connectToCCU('BidCos-RF', BCRF_XMLRPC_PORT, 'xmlrpc');
  }
  connectToCCU('HmIP-RF', HMIP_PORT, 'binrpc');

  console.log('✅ RPC Server started on port ' + RPC_SERVER_PORT);
}

function connectToCCU(
  interfaceName: string,
  port: number,
  protocol: 'binrpc' | 'xmlrpc',
): void {
  console.log(
    `Attempting to connect to ${interfaceName} at ${CCU_HOST}:${port} using ${protocol.toUpperCase()}...`,
  );

  // Create appropriate client based on protocol
  let client:
    | ReturnType<typeof binrpc.createClient>
    | ReturnType<typeof xmlrpc.createClient>;

  if (protocol === 'binrpc') {
    client = binrpc.createClient({ host: CCU_HOST, port: port });
  } else {
    // XMLRPC - add auth if needed
    const clientOptions: {
      host: string;
      port: number;
      basic_auth?: { user: string; pass: string };
    } = {
      host: CCU_HOST,
      port: port,
    };

    if (CCU_USER && CCU_PASS && !IS_LOCAL) {
      clientOptions.basic_auth = {
        user: CCU_USER,
        pass: CCU_PASS,
      };
    }

    client = xmlrpc.createClient(clientOptions);
  }

  rpcClients[interfaceName] = client;

  console.log(
    `🔌 Created ${protocol.toUpperCase()} client for ${interfaceName}`,
  );

  // Register callback URL
  // Use CALLBACK_HOST which should be the IP address reachable from CCU
  const callbackUrl = `http://${CALLBACK_HOST}:${RPC_SERVER_PORT}`;
  // Use a unique ID for this connection (must be unique across all clients!)
  const clientId = `WebSocketServer-${interfaceName}`;

  console.log(
    `📞 Registering callback URL: ${callbackUrl} for ${interfaceName}`,
  );
  console.log(`   Client ID: ${clientId}`);
  console.log(
    `⚠️  IMPORTANT: ${callbackUrl} must be reachable from CCU (${CCU_HOST})!`,
  );

  client.methodCall(
    'init',
    [callbackUrl, clientId],
    function (err: Error | null, result: unknown) {
      if (err) {
        console.error(`❌ Failed to initialize ${interfaceName}:`, err.message);
        console.error(`   Make sure ${CCU_HOST}:${port} is reachable`);
      } else {
        console.log(`✅ Connected to ${interfaceName} on ${CCU_HOST}:${port}`);
        console.log(`   Callback registered: ${callbackUrl}`);
        console.log(`   Client ID: ${clientId}`);
        console.log(`   Init result:`, result);
        console.log(`   ⏳ Waiting for events from devices...`);
      }
    },
  );
}

// Handle events from CCU
function handleCCUEvent(
  interfaceName: string,
  address: string,
  datapoint: string,
  value: unknown,
): void {
  console.log(`🔔 RAW CCU Event received:`, {
    interface: interfaceName,
    channel: address,
    datapoint: datapoint,
    value: value,
  });

  // Filter out PONG and STICKY_UNREACH events (heartbeat/monitoring)
  if (datapoint === 'PONG' || datapoint === 'STICKY_UNREACH') {
    console.log(`⏭️  Skipping ${datapoint} event`);
    return;
  }

  // Filter out WORKING events (only show final state changes)
  // WORKING indicates device is processing command, not the actual state
  if (datapoint === 'WORKING') {
    console.log(`⏭️  Skipping WORKING event for ${address}`);
    return;
  }

  console.log(`✅ Event passed filters, broadcasting...`);

  // Broadcast event to WebSocket clients
  const eventData: CCUEvent = {
    event: {
      interface: interfaceName,
      channel: address,
      datapoint: datapoint,
      value: value,
      timestamp: new Date().toISOString(),
    },
  };
  broadcastToClients(eventData);
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
async function executeRegaScript(script: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    regaConnection.exec(script, function (err: Error | null, result: unknown) {
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

  ws.on('message', async (message: Buffer | ArrayBuffer | Buffer[]) => {
    try {
      const messageStr = message.toString();

      // Try to parse as JSON first (for future compatibility)
      let isJson = false;
      let data: unknown;
      try {
        data = JSON.parse(messageStr);
        isJson = true;
      } catch {
        // Not JSON, treat as plain TCL script (Node-RED compatible)
        isJson = false;
      }

      if (isJson && data && typeof data === 'object') {
        // Handle JSON messages (new format)
        const msg = data as WebSocketMessage;
        if (msg.type === 'script') {
          const result = await executeRegaScript(msg.script);
          ws.send(
            JSON.stringify({
              type: 'script_response',
              result: result,
              requestId: msg.requestId,
            }),
          );
        } else if (msg.type === 'setValue') {
          const { address, datapoint, value } = msg;
          const script = `dom.GetObject("${address}").DPByHssDP("${datapoint}").State(${value});`;
          const result = await executeRegaScript(script);
          ws.send(
            JSON.stringify({
              type: 'setValue_response',
              result: result,
              requestId: msg.requestId,
            }),
          );
        }
      } else {
        // Handle plain TCL script (Node-RED compatible)
        const result = await executeRegaScript(messageStr);
        // Send result directly if it's already a string (likely JSON from Rega script)
        ws.send(typeof result === 'string' ? result : JSON.stringify(result));
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

// Test CCU connection after startup
setTimeout(() => {
  testCCUConnection();
}, 1000);

// Cleanup on exit
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down...');

  // Unregister from CCU interfaces
  Object.keys(rpcClients).forEach((interfaceName) => {
    console.log(`📤 Unregistering ${interfaceName}...`);
    const callbackUrl = `http://${CALLBACK_HOST}:${RPC_SERVER_PORT}`;
    rpcClients[interfaceName].methodCall(
      'init',
      [callbackUrl, ''],
      (err: Error | null) => {
        if (err)
          console.error(`Failed to unregister ${interfaceName}:`, err.message);
        else console.log(`✅ Unregistered ${interfaceName}`);
      },
    );
  });

  wss.close();
  server.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down (SIGINT)...');
  process.exit(0);
});
