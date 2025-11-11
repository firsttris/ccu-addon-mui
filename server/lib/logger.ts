import { config } from './config';

export const log = {
  info: (...args: unknown[]): void => console.log(...args),
  error: (...args: unknown[]): void => console.error(...args),
  debug: (...args: unknown[]): void => {
    if (config.debug) console.log(...args);
  },
} as const;

export const logStartupInfo = (): void => {
  log.info(`🚀 WebSocket Server starting...`);
  log.info(`   CCU Host: ${config.ccuHost}`);
  log.info(`   Callback Host: ${config.callbackHost}`);
  log.info(`   Rega Port: ${config.regaPort}`);
  log.info(`   Debug Mode: ${config.debug ? 'ON' : 'OFF'}`);
  if (config.ccuUser) log.info(`   Auth: enabled`);
};
