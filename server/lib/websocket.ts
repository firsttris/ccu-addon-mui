import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import type {
  CCUEvent,
  WebSocketMessage,
  ScriptMessage,
  SetValueMessage,
  SubscribeMessage,
} from './types';
import { config } from './config';
import { log } from './logger';
import { createDeviceSubscriptionManager } from './device-subscriptions';

export const createWebSocketServer = (
  executeScript: (script: string) => Promise<unknown>,
) => {
  const server = createServer();
  const wss = new WebSocketServer({ server });
  const clients = new Set<WebSocket>();

  // Store deviceId for each WebSocket connection
  const clientDeviceIds = new Map<WebSocket, string>();
  const subscriptionManager = createDeviceSubscriptionManager();

  const broadcastToClients = (data: CCUEvent): void => {
    const message = JSON.stringify(data);
    let sentCount = 0;
    let filteredCount = 0;

    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        const deviceId = clientDeviceIds.get(client);

        // Device must have a subscription to receive events
        if (
          !deviceId ||
          !subscriptionManager.shouldReceiveEvent(deviceId, data)
        ) {
          filteredCount++;
          return;
        }

        client.send(message);
        sentCount++;
      }
    });

    if (filteredCount > 0) {
      log.debug(
        `📤 Event ${data.event.channel}:${data.event.datapoint} sent to ${sentCount}/${clients.size} clients (${filteredCount} filtered)`,
      );
    }
  };

  const handleScriptMessage = async (
    ws: WebSocket,
    msg: ScriptMessage,
  ): Promise<void> => {
    const result = await executeScript(msg.script);
    ws.send(
      JSON.stringify({
        type: 'script_response',
        result,
        requestId: msg.requestId,
      }),
    );
  };

  const handleSetValueMessage = async (
    ws: WebSocket,
    msg: SetValueMessage,
  ): Promise<void> => {
    const { address, datapoint, value } = msg;
    const script = `dom.GetObject("${address}").DPByHssDP("${datapoint}").State(${value});`;
    const result = await executeScript(script);
    ws.send(
      JSON.stringify({
        type: 'setValue_response',
        result,
        requestId: msg.requestId,
      }),
    );
  };

  const handleSubscribeMessage = (
    ws: WebSocket,
    msg: SubscribeMessage,
  ): void => {
    const { deviceId, channels } = msg;

    // Store deviceId for this connection
    clientDeviceIds.set(ws, deviceId);

    // Subscribe device to channels
    subscriptionManager.subscribe(deviceId, channels);

    const stats = subscriptionManager.getStats();
    log.info(
      `📝 Device ${deviceId} subscribed to ${channels.length} channels. Total: ${stats.devices} devices, ${stats.totalChannels} channels`,
    );

    ws.send(
      JSON.stringify({
        type: 'subscribe_response',
        success: true,
        deviceId,
        channels: subscriptionManager.getSubscriptions(deviceId),
        requestId: msg.requestId,
      }),
    );
  };

  const handleJsonMessage = async (
    ws: WebSocket,
    data: WebSocketMessage,
  ): Promise<void> => {
    if (data.type === 'script') {
      await handleScriptMessage(ws, data);
    } else if (data.type === 'setValue') {
      await handleSetValueMessage(ws, data);
    } else if (data.type === 'subscribe') {
      handleSubscribeMessage(ws, data);
    }
  };

  const handlePlainScriptMessage = async (
    ws: WebSocket,
    messageStr: string,
  ): Promise<void> => {
    const result = await executeScript(messageStr);
    ws.send(typeof result === 'string' ? result : JSON.stringify(result));
  };

  const handleMessage = async (
    ws: WebSocket,
    message: Buffer | ArrayBuffer | Buffer[],
  ): Promise<void> => {
    try {
      const messageStr = message.toString();

      try {
        const data = JSON.parse(messageStr) as WebSocketMessage;
        await handleJsonMessage(ws, data);
      } catch {
        // Not JSON, treat as plain TCL script (Node-RED compatible)
        await handlePlainScriptMessage(ws, messageStr);
      }
    } catch (err) {
      log.error('Error handling message:', err);
      ws.send(
        JSON.stringify({
          type: 'error',
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  };

  const setupClientHandlers = (ws: WebSocket): void => {
    ws.on('message', (message) => handleMessage(ws, message));

    ws.on('close', () => {
      const deviceId = clientDeviceIds.get(ws);
      log.info(
        '🔌 WebSocket client disconnected. Remaining clients:',
        clients.size - 1,
      );
      clients.delete(ws);

      // Cleanup device subscription
      if (deviceId) {
        subscriptionManager.unsubscribe(deviceId);
        clientDeviceIds.delete(ws);
        log.debug(`📝 Unsubscribed device ${deviceId}`);
      }
    });

    ws.on('error', (err: Error) => {
      const deviceId = clientDeviceIds.get(ws);
      log.error('❌ WebSocket error:', err);
      clients.delete(ws);

      // Cleanup device subscription
      if (deviceId) {
        subscriptionManager.unsubscribe(deviceId);
        clientDeviceIds.delete(ws);
      }
    });
  };

  wss.on('connection', (ws: WebSocket) => {
    log.info(
      '🔗 New WebSocket client connected. Total clients:',
      clients.size + 1,
    );
    clients.add(ws);
    setupClientHandlers(ws);
  });

  const start = (): Promise<void> =>
    new Promise((resolve) => {
      server.listen(config.wsPort, () => {
        log.info(`WebSocket Server running on port ${config.wsPort}`);
        log.info(`WebSocket URL: ws://localhost:${config.wsPort}`);
        resolve();
      });
    });

  const close = (): void => {
    wss.close();
    server.close();
  };

  return {
    start,
    close,
    broadcastToClients,
    getClientsCount: () => clients.size,
  };
};
