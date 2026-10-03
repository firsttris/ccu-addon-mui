import { expect, test } from '@playwright/test';
import { installWebSocketMock } from './helpers/websocketMock';

// Screenshot baselines for refactorings that must not change the look.
// The tolerance is absolute: a ratio (e.g. 0.1 % of the pixels) lets a
// whole new line of text through on a phone screenshot.
// (icon library, styling migration). Font rendering differs between
// machines, so they only run on request in a fixed environment:
//   VISUAL=1 npx playwright test visual            compare
//   VISUAL=1 npx playwright test visual -u         update the baselines
test.skip(!process.env.VISUAL, 'visual regression tests run with VISUAL=1');

const viewports = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
];

// Every channel group open, so all controls are on the screenshot
const expandedGroups = [
  'SWITCH_VIRTUAL_RECEIVER',
  'BLIND_VIRTUAL_RECEIVER',
  'HEATING_CLIMATECONTROL_TRANSCEIVER',
  'CLIMATECONTROL_FLOOR_TRANSCEIVER',
  'KEYMATIC',
  'ENERGIE_METER_TRANSMITTER',
  'ROTARY_HANDLE_TRANSCEIVER',
  'SMOKE_DETECTOR',
];

const views = [
  { name: 'home', path: '/', ready: 'Wandthermostat Flur' },
  { name: 'rooms', path: '/rooms', ready: 'Heizungsraum' },
  { name: 'room-switch-generic', path: '/room/1', ready: 'Fenstergriff Wohnzimmer' },
  { name: 'room-blinds', path: '/room/2', ready: 'Küche Fenster' },
  { name: 'room-energy-door', path: '/room/3', ready: 'Haustür' },
  { name: 'trades', path: '/trades', ready: 'Heizung' },
  { name: 'trade-thermostat', path: '/trade/20', ready: 'Wohnzimmer Thermostat' },
  { name: 'all-devices', path: '/devices', ready: 'Rauchmelder Flur' },
];

test.use({ locale: 'de-DE', timezoneId: 'Europe/Berlin' });

for (const dark of [false, true]) {
  for (const viewport of viewports) {
    test.describe(`${viewport.name} ${dark ? 'dark' : 'light'}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test.beforeEach(async ({ page }) => {
        await page.clock.install({ time: new Date('2026-01-15T10:00:00+01:00') });
        await installWebSocketMock(page);
        await page.addInitScript(
          ({ dark, groups }) => {
            localStorage.setItem('theme-dark', JSON.stringify(dark));
            for (const group of groups) {
              localStorage.setItem(group, 'true');
            }
          },
          { dark, groups: expandedGroups },
        );
      });

      for (const view of views) {
        test(view.name, async ({ page }) => {
          await page.goto(view.path);
          await expect(page.getByText(view.ready).first()).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          await expect(page).toHaveScreenshot(`${view.name}-${viewport.name}-${dark ? 'dark' : 'light'}.png`, {
            fullPage: true,
            animations: 'disabled',
            maxDiffPixels: 10,
          });
        });
      }

      test('menu', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('button', { name: 'Menu' }).click();
        await expect(page.getByText('Heizungsraum')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`menu-${viewport.name}-${dark ? 'dark' : 'light'}.png`, {
          animations: 'disabled',
          maxDiffPixels: 10,
        });
      });
    });
  }
}
