import { expect, test } from './helpers/coverageTest';
import { installWebSocketMock, VALID_TOKEN } from './helpers/websocketMock';

test.beforeEach(async ({ page }) => {
  await installWebSocketMock(page, { requireLogin: true });
});

test('fragt nach der Anmeldung und bleibt nach einem Neuladen angemeldet', async ({ page }) => {
  await page.goto('/rooms');

  // Nothing is shown before logging in
  await expect(page.getByLabel(/Password|Passwort/)).toBeVisible();
  await expect(page.getByText('Wohnzimmer')).toHaveCount(0);

  await page.getByLabel(/Password|Passwort/).fill('wrong');
  await page.getByRole('button', { name: /Sign in|Anmelden/ }).click();
  await expect(page.getByRole('alert')).toHaveText(/Wrong username or password|Benutzername oder Passwort falsch/);

  await page.getByLabel(/Password|Passwort/).fill('secret');
  await page.getByRole('button', { name: /Sign in|Anmelden/ }).click();

  // The rooms requested before the login are loaded once logged in
  await expect(page.getByText('Wohnzimmer').first()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ccu-addon-mui_AuthToken'))).toBe(VALID_TOKEN);

  // Like closing and reopening the app in the kitchen: no new login
  await page.reload();
  await expect(page.getByText('Wohnzimmer').first()).toBeVisible();
  await expect(page.getByLabel(/Password|Passwort/)).toHaveCount(0);
});

test('Abmelden führt zurück zur Anmeldung', async ({ page }) => {
  await page.addInitScript((token) => localStorage.setItem('ccu-addon-mui_AuthToken', token), VALID_TOKEN);
  await page.goto('/rooms');
  await expect(page.getByText('Wohnzimmer').first()).toBeVisible();

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: /Log out|Abmelden/ }).click();

  await expect(page.getByLabel(/Password|Passwort/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ccu-addon-mui_AuthToken'))).toBeNull();
});
