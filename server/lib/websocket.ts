import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import type {
  CCUEvent,
  WebSocketMessage,
  ScriptMessage,
  SetValueMessage,
} from './types';
import { config } from './config';
import { log } from './logger';

export const createWebSocketServer = (
  executeScript: (script: string) => Promise<unknown>,
) => {
  const server = createServer();
  const wss = new WebSocketServer({ server });
  const clients = new Set<WebSocket>();

  const broadcastToClients = (data: CCUEvent): void => {
    const message = JSON.stringify(data);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
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

  const handleJsonMessage = async (
    ws: WebSocket,
    data: WebSocketMessage,
  ): Promise<void> => {
    if (data.type === 'script') {
      await handleScriptMessage(ws, data);
    } else if (data.type === 'setValue') {
      await handleSetValueMessage(ws, data);
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
      log.info(
        '🔌 WebSocket client disconnected. Remaining clients:',
        clients.size - 1,
      );
      clients.delete(ws);
    });

    ws.on('error', (err: Error) => {
      log.error('❌ WebSocket error:', err);
      clients.delete(ws);
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
