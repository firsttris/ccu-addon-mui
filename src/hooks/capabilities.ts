import type { Capabilities } from '../types/protocol';

export type { Capabilities };

// What the add-on runs on: a CCU3/OpenCCU or openccu-lite (no ReGa, no WebUI)
export type Platform = 'ccu' | 'lite';

// A CCU has everything; the server sends what its platform has on login
export const CCU_CAPABILITIES: Capabilities = {
  programs: true,
  sysvars: true,
  alarms: true,
  history: true,
  system: true,
  users: true,
  selfUpdate: true,
  channelOptions: true,
  comTest: true,
};
