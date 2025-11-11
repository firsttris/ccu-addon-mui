import xmlrpc from 'homematic-xmlrpc';
import type { CCUEvent, RPCClient } from './types';
import { config } from './config';
import { log } from './logger';

export const createRPCServer = (
  onEvent: (event: CCUEvent) => void,
): ReturnType<typeof xmlrpc.createServer> => {
  const bindHost =
    config.callbackHost === '127.0.0.1' || config.callbackHost === 'localhost'
      ? '127.0.0.1'
      : '0.0.0.0';

  const server = xmlrpc.createServer({
    host: bindHost,
    port: config.rpcServerPort,
  });

  log.debug(`✅ RPC Server created on ${bindHost}:${config.rpcServerPort}`);

  // Handle system.multicall events
  server.on(
    'system.multicall',
    (
      _method: string,
      params: unknown[],
      callback: (err: null | Error, result?: string) => void,
    ) => {
      log.debug(
        '📨 Received system.multicall with',
        params[0] ? (params[0] as Array<unknown>).length : 0,
        'events',
      );

      (
        params[0] as Array<{ params: [string, string, string, unknown] }>
      ).forEach((event, index) => {
        log.debug(
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
          onEvent,
        );
      });

      callback(null, '');
    },
  );

  // Handle system.listMethods
  server.on(
    'system.listMethods',
    (
      _err: Error,
      _params: unknown[],
      callback: (err: null | Error, result?: string[]) => void,
    ) => {
      log.debug('📋 system.listMethods called');
      callback(null, ['system.listMethods', 'system.multicall', 'listDevices']);
    },
  );

  // Handle listDevices
  server.on(
    'listDevices',
    (
      _err: Error,
      _params: unknown[],
      callback: (err: null | Error, result?: unknown[]) => void,
    ) => {
      log.debug('📱 listDevices called');
      callback(null, []);
    },
  );

  return server;
};

const handleCCUEvent = (
  interfaceName: string,
  address: string,
  datapoint: string,
  value: unknown,
  onEvent: (event: CCUEvent) => void,
): void => {
  log.debug('🔔 CCU Event:', {
    interface: interfaceName,
    address,
    datapoint,
    value,
  });

  const event: CCUEvent = {
    event: {
      interface: interfaceName,
      channel: address,
      datapoint,
      value,
      timestamp: new Date().toISOString(),
    },
  };

  onEvent(event);
  log.debug('📤 Event broadcasted to WebSocket clients');
};

export const createRPCClient = (port: number): RPCClient => {
  const clientOptions: {
    host: string;
    port: number;
    basic_auth?: { user: string; pass: string };
  } = {
    host: config.ccuHost,
    port,
  };

  if (config.ccuUser && config.ccuPass) {
    log.debug(`🔑 Using basic auth for port ${port}`);
    clientOptions.basic_auth = {
      user: config.ccuUser,
      pass: config.ccuPass,
    };
  }

  return xmlrpc.createClient(clientOptions);
};

export const connectToCCU = (
  interfaceName: string,
  port: number,
): RPCClient => {
  log.debug(
    `🔌 Attempting to connect to ${interfaceName} at ${config.ccuHost}:${port}...`,
  );

  const client = createRPCClient(port);
  const callbackUrl = `http://${config.callbackHost}:${config.rpcServerPort}`;
  const interfaceId = `websocket-server-${interfaceName}`;

  log.debug(
    `📞 Calling init on ${interfaceName} with callback URL: ${callbackUrl}`,
  );

  client.methodCall('init', [callbackUrl, interfaceId], (err: Error | null) => {
    if (err) {
      log.error(`❌ Failed to initialize ${interfaceName}:`, err.message);
      log.error(`   Make sure ${config.ccuHost}:${port} is reachable`);
      log.debug(`   Full error:`, err);
    } else {
      log.info(`✅ Connected to ${interfaceName} on ${config.ccuHost}:${port}`);
      log.debug(
        `   ${interfaceName} will now send events to ${callbackUrl} with ID: ${interfaceId}`,
      );
    }
  });

  return client;
};

export const initRPC = (
  onEvent: (event: CCUEvent) => void,
): {
  server: ReturnType<typeof xmlrpc.createServer>;
  clients: Record<string, RPCClient>;
} => {
  log.debug('🚀 Initializing RPC connections...');

  const server = createRPCServer(onEvent);
  const clients: Record<string, RPCClient> = {};

  clients['BidCos-RF'] = connectToCCU('BidCos-RF', config.rpcPort);
  clients['HmIP-RF'] = connectToCCU('HmIP-RF', config.hmipPort);

  log.info(`✅ RPC Server started and listening for callbacks from CCU`);
  log.info(
    `   CCU will send events to: http://${config.callbackHost}:${config.rpcServerPort}`,
  );

  return { server, clients };
};

export const unregisterRPCClients = (
  clients: Record<string, RPCClient>,
): void => {
  Object.keys(clients).forEach((interfaceName) => {
    const interfaceId = `websocket-server-${interfaceName}`;
    log.info(`📤 Unregistering ${interfaceId}...`);
    clients[interfaceName].methodCall('init', ['', ''], (err) => {
      if (err)
        log.error(`❌ Failed to unregister ${interfaceName}:`, err.message);
      else log.info(`✅ Unregistered ${interfaceId}`);
    });
  });
};
