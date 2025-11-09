#!/usr/bin/env node

const WebSocket = require('ws');
const http = require('http');
const xmlrpc = require('homematic-xmlrpc');
const rega = require('homematic-rega');

// Configuration
const WS_PORT = 8088;
const RPC_PORT = 2001; // BidCos-RF
const HMIP_PORT = 2010; // HmIP-RF
const CCU_HOST = 'localhost';

// Create HTTP server for WebSocket
const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = new Set();

// CCU Rega instance
const regaConnection = new rega.Rega({
  host: CCU_HOST,
  port: 8181
});

// RPC Server to receive events from CCU
let rpcServer;
let rpcClients = {};

// Initialize RPC connections
function initRPC() {
  // Create RPC server to receive events
  rpcServer = xmlrpc.createServer({ host: '127.0.0.1', port: 9099 });
  
  rpcServer.on('system.multicall', function(method, params, callback) {
    params[0].forEach(function(event) {
      handleCCUEvent(event.params[0], event.params[1], event.params[2], event.params[3]);
    });
    callback(null, '');
  });
  
  rpcServer.on('event', function(err, params, callback) {
    handleCCUEvent(params[0], params[1], params[2], params[3]);
    callback(null, '');
  });
  
  rpcServer.on('newDevices', function(err, params, callback) {
    console.log('New devices detected');
    callback(null, '');
  });
  
  rpcServer.on('deleteDevices', function(err, params, callback) {
    console.log('Devices deleted');
    callback(null, '');
  });
  
  // Connect to CCU interfaces
  connectToCCU('BidCos-RF', RPC_PORT);
  connectToCCU('HmIP-RF', HMIP_PORT);
  
  console.log('RPC Server started on port 9099');
}

function connectToCCU(interfaceName, port) {
  const client = xmlrpc.createClient({ host: CCU_HOST, port: port });
  rpcClients[interfaceName] = client;
  
  // Register callback URL
  client.methodCall('init', ['http://127.0.0.1:9099', interfaceName], function(err) {
    if (err) {
      console.error(`Failed to initialize ${interfaceName}:`, err.message);
    } else {
      console.log(`Connected to ${interfaceName} on port ${port}`);
    }
  });
}

// Handle events from CCU
function handleCCUEvent(interfaceName, address, datapoint, value) {
  const event = {
    event: {
      interface: interfaceName,
      channel: address,
      datapoint: datapoint,
      value: value,
      timestamp: new Date().toISOString()
    }
  };
  
  // Broadcast to all connected WebSocket clients
  broadcastToClients(event);
}

// Broadcast message to all WebSocket clients
function broadcastToClients(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Execute Rega script
async function executeRegaScript(script) {
  return new Promise((resolve, reject) => {
    regaConnection.script(script, function(err, result) {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

// WebSocket server
wss.on('connection', (ws) => {
  console.log('New WebSocket client connected');
  clients.add(ws);
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle different message types
      if (data.type === 'script') {
        // Execute Rega script
        const result = await executeRegaScript(data.script);
        ws.send(JSON.stringify({
          type: 'script_response',
          result: result,
          requestId: data.requestId
        }));
      } else if (data.type === 'setValue') {
        // Set a datapoint value
        const { address, datapoint, value } = data;
        const script = `dom.GetObject("${address}").DPByHssDP("${datapoint}").State(${value});`;
        const result = await executeRegaScript(script);
        ws.send(JSON.stringify({
          type: 'setValue_response',
          result: result,
          requestId: data.requestId
        }));
      }
    } catch (err) {
      console.error('Error handling message:', err);
      ws.send(JSON.stringify({
        type: 'error',
        error: err.message
      }));
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    clients.delete(ws);
  });
  
  ws.on('error', (err) => {
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
  Object.keys(rpcClients).forEach(interfaceName => {
    rpcClients[interfaceName].methodCall('init', ['http://127.0.0.1:9099', ''], (err) => {
      if (err) console.error(`Failed to unregister ${interfaceName}:`, err.message);
    });
  });
  
  wss.close();
  server.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  process.exit(0);
});
