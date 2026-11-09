import type { Page } from '@playwright/test';
import { expect, test } from './helpers/coverageTest';
import { installWebSocketMock } from './helpers/websocketMock';

// The add-on's server delivers the app's scripts (lighttpd forwards
// /addons/mui/assets/ to it). When it isn't running, lighttpd answers 503:
// index.html says so instead of staying white, with what status.cgi tells.

const failScripts = (page: Page) => page.route('**/src/main.tsx', (route) => route.fulfill({ status: 503, body: '' }));
const answerStatus = (page: Page, status: object) =>
  page.route('**/addons/mui/status.cgi', (route) => route.fulfill({ json: status }));

test('sagt, dass der Server nicht läuft, wenn die Skripte der App nicht laden', async ({ page }) => {
  await failScripts(page);
  await page.goto('/rooms');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText(/MUI cannot be loaded|MUI lässt sich nicht laden/);
  await expect(alert).toContainText(/Restart the add-on|Starten Sie das Add-on neu/);
  await expect(alert.getByRole('link')).toHaveAttribute('href', /installation\.html#h%C3%A4ufige-probleme$/);
  // Shown once, even if more than one file fails
  await expect(alert).toHaveCount(1);
  // Without status.cgi (dev server, openccu-lite) nothing more
  await expect(alert).not.toContainText(/not running|läuft nicht/);

  // Reloading once the server runs again brings up the app
  await page.unroute('**/src/main.tsx');
  await installWebSocketMock(page);
  await alert.getByRole('button', { name: /Reload|Neu laden/ }).click();
  await expect(page.getByText('Wohnzimmer').first()).toBeVisible();
  await expect(page.getByText(/MUI cannot be loaded|MUI lässt sich nicht laden/)).toHaveCount(0);
});

test('zeigt die letzte Meldung des Servers aus status.cgi', async ({ page }) => {
  const reason = '2026/11/09 17:00:02 ❌ listen tcp 127.0.0.1:8088: bind: address already in use <b>';
  await failScripts(page);
  await answerStatus(page, { running: false, reason });
  await page.goto('/rooms');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText(/It is not running|Er läuft nicht/);
  // As text, not as markup
  await expect(alert.locator('pre')).toHaveText(reason);
});

test('sagt, wenn der Server läuft, aber noch nicht antwortet', async ({ page }) => {
  await failScripts(page);
  await answerStatus(page, { running: true, reason: '' });
  await page.goto('/rooms');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText(/running but not answering yet|läuft, antwortet aber noch nicht/);
  await expect(alert.locator('pre')).toHaveCount(0);
});

test('zeigt den Hinweis nicht, wenn die App lädt', async ({ page }) => {
  await installWebSocketMock(page);
  await page.goto('/rooms');
  await expect(page.getByText('Wohnzimmer').first()).toBeVisible();
  await expect(page.getByText(/MUI cannot be loaded|MUI lässt sich nicht laden/)).toHaveCount(0);
});
