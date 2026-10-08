import { expect, test, type Page } from '@playwright/test';
import { installWebSocketMock } from '../e2e/helpers/websocketMock';

// The add-on updating itself, as on the CCU: the app (built as 1.0.0 and
// 1.0.1, e2e-update/build.mjs) comes from server.mjs with its service
// worker. The WebSocket server is mocked; for the update it reports progress,
// answers, and restarts: it swaps in the new files (as update_script does)
// and drops the connection. The test passes only if this browser runs 1.0.1
// in the end, which the app checks itself after the reload (UpdateDone).

const SERVER = 'http://127.0.0.1:4202';
const INSTALLED = '1.0.0';
const NEW = '1.0.1';

let served = INSTALLED;

const fakeUpdateServer = async (page: Page) => {
  await page.exposeFunction('servedVersion', () => served);
  await page.exposeFunction('restartServer', async () => {
    await fetch(`${SERVER}/__update`);
    served = NEW;
  });
  await page.addInitScript(
    ([latest]) => {
      type Socket = { send: (data: string) => void; dispatchMessage: (payload: unknown) => void; close: () => void };
      const page = window as unknown as { WebSocket: { prototype: Socket }; servedVersion: () => Promise<string>; restartServer: () => Promise<void> };
      const proto = page.WebSocket.prototype;
      const send = proto.send;
      proto.send = function (this: Socket, data: string) {
        const message = JSON.parse(data) as { type: string; requestId?: string };
        const later = (ms: number, payload: unknown) => setTimeout(() => this.dispatchMessage(payload), ms);
        if (message.type === 'checkSelfUpdate') {
          void page.servedVersion().then((current) =>
            later(20, { type: 'checkSelfUpdate_response', requestId: message.requestId, current, latest, installable: true }),
          );
          return;
        }
        if (message.type === 'installSelfUpdate') {
          const total = 5 * 1024 * 1024;
          for (let i = 0; i <= 5; i++) later(100 + i * 150, { type: 'selfUpdateProgress', phase: 'download', done: (total * i) / 5, total });
          later(1100, { type: 'selfUpdateProgress', phase: 'verify' });
          later(1300, { type: 'selfUpdateProgress', phase: 'unpack' });
          later(1500, { type: 'selfUpdateProgress', phase: 'install' });
          later(2000, { type: 'installSelfUpdate_response', requestId: message.requestId, success: true, version: latest });
          // The update script restarts the server a few seconds later
          setTimeout(async () => {
            await page.restartServer();
            this.close();
          }, 2500);
          return;
        }
        send.call(this, data);
      };
    },
    [NEW],
  );
};

// The app open and controlled by its service worker, as after any visit
const openApp = async (page: Page) => {
  await installWebSocketMock(page);
  await fakeUpdateServer(page);
  await page.goto('/addons/mui/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
};

const startUpdate = async (page: Page) => {
  await expect(page.getByRole('dialog')).toContainText(`MUI ${NEW} ist erschienen, installiert ist ${INSTALLED}`);
  await page.getByRole('button', { name: 'Jetzt aktualisieren' }).click();
  await page.getByRole('button', { name: 'Update installieren' }).click();
};

test.beforeEach(async () => {
  await fetch(`${SERVER}/__reset`);
  served = INSTALLED;
});

test('installiert das Update und läuft danach in der neuen Version', async ({ page }) => {
  await openApp(page);
  await startUpdate(page);
  // The steps as the server reports them
  await expect(page.getByRole('list', { name: 'Schritte des Updates' })).toBeVisible();
  // The app reloads by itself into the new version and says so
  await expect(page.getByRole('dialog')).toContainText(`MUI ${NEW} ist installiert und läuft`, { timeout: 60_000 });
  // The new app's files, from the new service worker
  const script = await page.evaluate(async () => (await (await fetch('/addons/mui/index.html')).text()).match(/index-[\w-]+\.js/)?.[0]);
  const html = await (await fetch(`${SERVER}/addons/mui/index.html`)).text();
  expect(html).toContain(script);
});

test('lädt andere Tabs nicht mitten im Bearbeiten neu', async ({ page, context }) => {
  await openApp(page);
  const other = await context.newPage();
  await installWebSocketMock(other);
  await other.goto('/addons/mui/');
  await other.evaluate(() => ((window as unknown as { untouched: boolean }).untouched = true));

  await page.reload();
  await startUpdate(page);
  await expect(page.getByRole('dialog')).toContainText('noch in einem anderen Tab offen', { timeout: 60_000 });
  expect(await other.evaluate(() => (window as unknown as { untouched?: boolean }).untouched)).toBe(true);

  // Saved there: "Jetzt neu laden" takes the new version over
  await page.getByRole('button', { name: 'Jetzt neu laden' }).click();
  await expect(page.getByRole('dialog')).toContainText(`MUI ${NEW} ist installiert und läuft`, { timeout: 30_000 });
});

test('fragt nach "Überspringen" bei dieser Version nicht mehr', async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole('dialog')).toContainText(`MUI ${NEW} ist erschienen`);
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await page.reload();
  await page.waitForTimeout(1500);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
