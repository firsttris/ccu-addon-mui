#!/usr/bin/env node

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import xmlrpc from 'homematic-xmlrpc';
import Rega from 'homematic-rega';

// Configuration
const WS_PORT = 8088;
const RPC_PORT = 2001; // BidCos-RF
const HMIP_PORT = 2010; // HmIP-RF
const RPC_SERVER_PORT = 9099;
const CCU_HOST = process.env.CCU_HOST || 'localhost';
const CCU_USER = process.env.CCU_USER;
const CCU_PASS = process.env.CCU_PASS;

// CALLBACK_HOST is the IP/hostname where THIS server runs and CCU can reach it
// - On CCU itself: use 'localhost' or '127.0.0.1'
// - For local development: use your dev machine's IP (e.g., '192.168.178.134')
const CALLBACK_HOST = process.env.CALLBACK_HOST || '127.0.0.1';

// Port 8183 is used for local connections on CCU (no auth required for localhost)
// Port 8181 is used for remote connections (auth required)
const REGA_PORT = CCU_HOST === 'localhost' ? 8183 : 8181;

console.log(`CCU Host: ${CCU_HOST}`);
console.log(`Callback Host: ${CALLBACK_HOST}`);
console.log(`Rega Port: ${REGA_PORT}`);
console.log(`CCU Auth: ${CCU_USER ? 'enabled' : 'disabled'}`);

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

interface RPCClient {
  methodCall(
    method: string,
    params: unknown[],
    callback: (err: Error | null, result?: unknown) => void,
  ): void;
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
let rpcServer: ReturnType<typeof xmlrpc.createServer>;
const rpcClients: Record<string, RPCClient> = {};

// Initialize RPC connections
function initRPC(): void {
  console.log('🚀 Initializing RPC connections...');

  // Create RPC server to receive events
  // Bind to 0.0.0.0 to accept connections from CCU (if running remotely)
  const bindHost =
    CALLBACK_HOST === '127.0.0.1' || CALLBACK_HOST === 'localhost'
      ? '127.0.0.1'
      : '0.0.0.0';

  // Use rpcHttpServer and manually handle XML-RPC requests
  rpcServer = xmlrpc.createServer({ host: bindHost, port: RPC_SERVER_PORT });
  console.log(`✅ RPC Server created on ${bindHost}:${RPC_SERVER_PORT}`);
  rpcServer.on(
    'system.multicall',
    function (
      _method: string,
      params: unknown[],
      callback: (err: null | Error, result?: string) => void,
    ) {
      console.log(
        '📨 Received system.multicall with',
        params[0] ? (params[0] as Array<unknown>).length : 0,
        'events',
      );
      (
        params[0] as Array<{ params: [string, string, string, unknown] }>
      ).forEach(function (event, index) {
        console.log(
          `  Event ${index + 1}:`,
          event.params[0],
          event.params[1],
          event.params[2],
          event.params[3],
        );
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

  // Required RPC methods that CCU calls
  rpcServer.on(
    'system.listMethods',
    function (
      _err: Error,
      params: unknown[],
      callback: (err: null | Error, result?: string[]) => void,
    ) {
      console.log('📋 system.listMethods called');
      callback(null, ['system.listMethods', 'system.multicall', 'listDevices']);
    },
  );

  rpcServer.on(
    'listDevices',
    function (
      _err: Error,
      params: unknown[],
      callback: (err: null | Error, result?: unknown[]) => void,
    ) {
      console.log('📱 listDevices called');
      callback(null, []);
    },
  );

  // Connect to CCU interfaces
  connectToCCU('BidCos-RF', RPC_PORT);
  connectToCCU('HmIP-RF', HMIP_PORT);

  console.log(`✅ RPC Server started and listening for callbacks from CCU`);
  console.log(
    `📍 CCU will send events to: http://${CALLBACK_HOST}:${RPC_SERVER_PORT}`,
  );
}

function connectToCCU(interfaceName: string, port: number): void {
  console.log(
    `🔌 Attempting to connect to ${interfaceName} at ${CCU_HOST}:${port}...`,
  );

  const clientOptions: {
    host: string;
    port: number;
    basic_auth?: { user: string; pass: string };
  } = {
    host: CCU_HOST,
    port: port,
  };

  // Add basic auth if credentials are provided
  if (CCU_USER && CCU_PASS) {
    console.log(`🔑 Using basic auth for ${interfaceName}`);
    clientOptions.basic_auth = {
      user: CCU_USER,
      pass: CCU_PASS,
    };
  }

  const client = xmlrpc.createClient(clientOptions);
  rpcClients[interfaceName] = client;

  // Build callback URL that CCU can reach
  const callbackUrl = `http://${CALLBACK_HOST}:${RPC_SERVER_PORT}`;

  console.log(
    `📞 Calling init on ${interfaceName} with callback URL: ${callbackUrl}`,
  );

  // Register callback URL with unique interface ID
  // Using a unique ID like 'websocket-server-BidCos-RF' to avoid conflicts
  const interfaceId = `websocket-server-${interfaceName}`;

  client.methodCall(
    'init',
    [callbackUrl, interfaceId],
    function (err: Error | null) {
      if (err) {
        console.error(`❌ Failed to initialize ${interfaceName}:`, err.message);
        console.error(`   Make sure ${CCU_HOST}:${port} is reachable`);
        console.error(`   Full error:`, err);
      } else {
        console.log(`✅ Connected to ${interfaceName} on ${CCU_HOST}:${port}`);
        console.log(
          `✅ ${interfaceName} will now send events to ${callbackUrl} with ID: ${interfaceId}`,
        );
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
  console.log('🔔 CCU Event:', {
    interface: interfaceName,
    address: address,
    datapoint: datapoint,
    value: value,
  });

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
  console.log('📤 Event broadcasted to', clients.size, 'WebSocket clients');
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
  console.log(
    '🔗 New WebSocket client connected. Total clients:',
    clients.size + 1,
  );
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
    console.log(
      '🔌 WebSocket client disconnected. Remaining clients:',
      clients.size - 1,
    );
    clients.delete(ws);
  });

  ws.on('error', (err: Error) => {
    console.error('❌ WebSocket error:', err);
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
    const interfaceId = `websocket-server-${interfaceName}`;
    console.log(`📤 Unregistering ${interfaceId}...`);
    rpcClients[interfaceName].methodCall('init', ['', ''], (err) => {
      if (err)
        console.error(`❌ Failed to unregister ${interfaceName}:`, err.message);
      else console.log(`✅ Unregistered ${interfaceId}`);
    });
  });

  wss.close();
  server.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down (SIGINT)...');
  process.exit(0);
});
