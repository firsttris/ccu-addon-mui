import Rega from 'homematic-rega';
import { config } from './config';
import { log } from './logger';

export const createRegaConnection = () => {
  const regaConfig = {
    host: config.ccuHost,
    port: config.regaPort,
    ...(config.ccuUser && config.ccuPass
      ? {
          auth: true,
          user: config.ccuUser,
          pass: config.ccuPass,
        }
      : {}),
  };

  return new Rega(regaConfig);
};

export const executeRegaScript =
  (regaConnection: ReturnType<typeof createRegaConnection>) =>
  (script: string): Promise<unknown> =>
    new Promise((resolve, reject) => {
      regaConnection.exec(script, (err: Error | null, result: unknown) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });

export const testCCUConnection = async (
  executeScript: (script: string) => Promise<unknown>,
): Promise<void> => {
  log.debug(
    `Testing connection to CCU Rega at ${config.ccuHost}:${config.regaPort}...`,
  );
  try {
    await executeScript('Write("Hello from WebSocket Server");');
    log.info('✅ CCU Rega connection successful');
  } catch (err) {
    log.error(
      '❌ CCU Rega connection failed:',
      err instanceof Error ? err.message : String(err),
    );
    log.error(`   Make sure ${config.ccuHost}:${config.regaPort} is reachable`);
  }
};
