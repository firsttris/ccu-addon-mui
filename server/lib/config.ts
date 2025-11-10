import type { Config } from './types';

const CCU_HOST = process.env.CCU_HOST || 'localhost';

export const config: Config = {
  wsPort: 8088,
  rpcPort: 2001, // BidCos-RF
  hmipPort: 2010, // HmIP-RF
  rpcServerPort: 9099,
  ccuHost: CCU_HOST,
  ccuUser: process.env.CCU_USER,
  ccuPass: process.env.CCU_PASS,
  debug: process.env.DEBUG === 'true',
  callbackHost: process.env.CALLBACK_HOST || '127.0.0.1',
  regaPort: CCU_HOST === 'localhost' ? 8183 : 8181,
};
