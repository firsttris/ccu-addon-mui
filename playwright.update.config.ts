import { defineConfig } from '@playwright/test';

// The add-on updating itself, up to this browser running the new app: two
// builds (npm run test:update builds them first) served as on the CCU, the
// service worker on, unlike the other tests. Guards #196's problems: no
// takeover found, other tabs reloaded, the old app after "done".
export default defineConfig({
  testDir: './e2e-update',
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 120_000,
  use: {
    baseURL: 'http://127.0.0.1:4202',
    trace: 'on-first-retry',
    locale: 'de-DE',
    viewport: { width: 420, height: 760 },
  },
  webServer: {
    command: 'node e2e-update/server.mjs',
    url: 'http://127.0.0.1:4202/addons/mui/',
    reuseExistingServer: false,
  },
});
