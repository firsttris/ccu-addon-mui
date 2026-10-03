import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

// Frontend and server together against the fake CCU (go-server/pkg/fakeccu)
// with fixtures/demo-ccu.json. Ports differ from `npm run dev:fake`, so both
// can run at the same time.
const fakeCCU = {
  rega: 28181,
  webui: 28080,
  bidcos: 22001,
  hmip: 22010,
  virtual: 29292,
};

// The server's state files, new for every run
const stateDir = path.join(os.tmpdir(), `mui-stack-${process.pid}`);

export const FAKE_CCU_URL = `http://127.0.0.1:${fakeCCU.webui}`;

export default defineConfig({
  testDir: './e2e-stack',
  // All tests share the fake CCU's state
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4201',
    trace: 'on-first-retry',
    serviceWorkers: 'block',
    locale: 'de-DE',
  },
  webServer: [
    {
      command:
        `cd go-server && go run ./cmd/fakeccu -fixture ../fixtures/demo-ccu.json -rega-port ${fakeCCU.rega} ` +
        `-webui-port ${fakeCCU.webui} -bidcos-port ${fakeCCU.bidcos} -hmip-port ${fakeCCU.hmip} -virtual-port ${fakeCCU.virtual}`,
      port: fakeCCU.webui,
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: `mkdir -p ${stateDir} && cd go-server && go run .`,
      port: 28088,
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        CCU_HOST: '127.0.0.1',
        REGA_PORT: String(fakeCCU.rega),
        RPC_PORT: String(fakeCCU.bidcos),
        HMIP_PORT: String(fakeCCU.hmip),
        VIRTUAL_DEVICES_PORT: String(fakeCCU.virtual),
        CCU_WEBUI_URL: FAKE_CCU_URL,
        WS_PORT: '28088',
        RPC_SERVER_PORT: '29099',
        AUTH_MODE: 'ccu',
        AUTH_KEY_FILE: path.join(stateDir, 'auth.key'),
        SESSIONS_FILE: path.join(stateDir, 'sessions.json'),
        AUDIT_LOG_FILE: path.join(stateDir, 'audit.log'),
      },
    },
    {
      command: 'npx vite --mode stack --host=127.0.0.1 --port=4201 --strictPort',
      url: 'http://127.0.0.1:4201',
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
