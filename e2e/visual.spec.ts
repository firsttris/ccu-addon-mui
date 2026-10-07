import { expect, Page, test } from '@playwright/test';
import { installWebSocketMock } from './helpers/websocketMock';

// Screenshot baselines, so changes to the look are seen and intended.
// The tolerance is absolute: a ratio (e.g. 0.1 % of the pixels) lets a
// whole new line of text through on a phone screenshot.
// Font rendering differs between machines, so they only run on request in
// a fixed environment:
//   VISUAL=1 npx playwright test visual            compare
//   VISUAL=1 npx playwright test visual -u         update the baselines
test.skip(!process.env.VISUAL, 'visual regression tests run with VISUAL=1');

const viewports = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
];

const views = [
  { name: 'rooms', path: '/rooms', ready: 'Heizungsraum' },
  { name: 'room-switch-generic', path: '/room/1', ready: 'Fenstergriff Wohnzimmer' },
  { name: 'room-blinds', path: '/room/2', ready: 'Küche Fenster' },
  { name: 'room-energy-door', path: '/room/3', ready: 'Haustür' },
  { name: 'health', path: '/health', ready: 'Fensterkontakt Bad' },
  { name: 'rules', path: '/rules', ready: 'Haustür nachts geöffnet' },
  { name: 'trades', path: '/trades', ready: 'Heizung' },
  { name: 'trade-thermostat', path: '/trade/20', ready: 'Fußbodenheizung Bad' },
  // Tiles that read the device's value lists grow once those arrived
  // The longest page with the most glowing tiles: their blur comes out a
  // few hundred pixels different from run to run; a new line of text is
  // thousands
  { name: 'all-devices', path: '/devices', ready: 'Rauchmelder Flur', loaded: ['Rauchtest', 'Berechtigt: Benutzer 1'], maxDiffPixels: 500 },
];

test.use({ locale: 'de-DE', timezoneId: 'Europe/Berlin' });

// Tiles load what they show later (paramset descriptions, value lists):
// wait until the app sent no request for half a second and the page kept
// its height, so the screenshot doesn't catch a tile half loaded
const settle = async (page: Page) => {
  let last = '';
  let quiet = 0;
  for (let i = 0; i < 100 && quiet < 5; i++) {
    const state = await page.evaluate(
      () =>
        `${(window as Window & { __wsMock?: { sentMessages: () => unknown[] } }).__wsMock?.sentMessages().length} ${document.documentElement.scrollHeight}`,
    );
    quiet = state === last ? quiet + 1 : 0;
    last = state;
    await page.waitForTimeout(100);
  }
};

// A sheet or dialog slides in: until its animations ended, a screenshot
// may catch it on the way
const opened = async (page: Page) => {
  await page
    .getByRole('dialog')
    .evaluate((el) =>
      Promise.all(
        el
          .getAnimations({ subtree: true })
          // Not the endless ones (a pulsing dot)
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished),
      ),
    );
  await page.evaluate(() => document.fonts.ready);
};

for (const dark of [false, true]) {
  for (const viewport of viewports) {
    test.describe(`${viewport.name} ${dark ? 'dark' : 'light'}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test.beforeEach(async ({ page }) => {
        await page.clock.install({ time: new Date('2026-01-15T10:00:00+01:00') });
        await installWebSocketMock(page);
        await page.addInitScript((dark) => localStorage.setItem('theme-dark', JSON.stringify(dark)), dark);
      });

      for (const view of views) {
        test(view.name, async ({ page }) => {
          await page.goto(view.path);
          await expect(page.getByText(view.ready).first()).toBeVisible();
          for (const name of (view as { loaded?: string[] }).loaded ?? []) {
            await expect(page.getByLabel(name, { exact: true }).first()).toBeVisible();
          }
          await page.evaluate(() => document.fonts.ready);
          await settle(page);
          // The whole page in one window instead of fullPage: for that
          // Playwright stretches the window to the page, and parts sized by
          // the window height (vh) grow the page again, by a few pixels or
          // not, from one screenshot to the next
          for (let i = 0; i < 5; i++) {
            const height = await page.evaluate(() => document.documentElement.scrollHeight);
            if (height === page.viewportSize()?.height) break;
            await page.setViewportSize({ width: viewport.width, height });
          }
          await expect(page).toHaveScreenshot(`${view.name}-${viewport.name}-${dark ? 'dark' : 'light'}.png`, {
            animations: 'disabled',
            maxDiffPixels: (view as { maxDiffPixels?: number }).maxDiffPixels ?? 10,
          });
        });
      }

      test('login', async ({ page, context }) => {
        // A fresh page that has to log in
        await context.clearCookies();
        const loginPage = await context.newPage();
        await installWebSocketMock(loginPage, { requireLogin: true });
        await loginPage.addInitScript((dark) => localStorage.setItem('theme-dark', JSON.stringify(dark)), dark);
        await loginPage.goto('/');
        await expect(loginPage.getByLabel(/Passwort/)).toBeVisible();
        await loginPage.evaluate(() => document.fonts.ready);
        await expect(loginPage).toHaveScreenshot(`login-${viewport.name}-${dark ? 'dark' : 'light'}.png`, {
          animations: 'disabled',
          maxDiffPixels: 10,
        });
      });

      test('notices', async ({ page }) => {
        await page.goto('/room/1');
        await settle(page);
        await page.getByRole('button', { name: /^Meldungen: / }).click();
        await expect(page.getByRole('dialog').getByText('Fensterkontakt Bad')).toBeVisible();
        await opened(page);
        await expect(page).toHaveScreenshot(`notices-${viewport.name}-${dark ? 'dark' : 'light'}.png`, {
          animations: 'disabled',
          maxDiffPixels: 10,
        });
      });

      test('menu', async ({ page }) => {
        await page.goto('/room/1');
        await settle(page);
        await page.getByRole('button', { name: 'Menü' }).click();
        await expect(page.getByRole('dialog').getByText('Heizungsraum')).toBeVisible();
        await opened(page);
        await expect(page).toHaveScreenshot(`menu-${viewport.name}-${dark ? 'dark' : 'light'}.png`, {
          animations: 'disabled',
          maxDiffPixels: 10,
        });
      });
    });
  }
}
