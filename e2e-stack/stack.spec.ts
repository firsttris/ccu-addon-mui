import { expect, test } from '@playwright/test';
import { deviceReports, login, resetFakeCCU } from './helpers';

// The whole chain: browser → Vite proxy → go-server → fake CCU (ReGa and
// XML-RPC) and the events back.

test.beforeEach(async () => {
  await resetFakeCCU();
});

test('meldet sich mit einem CCU-Benutzer an und lehnt ein falsches Passwort ab', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/Benutzername/).fill('Admin');
  await page.getByLabel(/Passwort/).fill('falsch');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('alert')).toBeVisible();

  await page.getByLabel(/Passwort/).fill('secret');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'CCU Addon MUI' })).toBeVisible();

  // Stays logged in after a reload (token)
  await page.reload();
  await expect(page.getByRole('heading', { name: 'CCU Addon MUI' })).toBeVisible();
});

test('schaltet ein Licht und zeigt Änderungen vom Gerät live an', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Räume' }).click();
  await page.getByText('Wohnzimmer').click();
  await page.getByText('Schalter', { exact: true }).click();

  const light = page.getByText('Wohnzimmer Licht');
  await expect(light).toBeVisible();
  const glowing = () => light.locator('..').locator('div').last().evaluate((el) => getComputedStyle(el).filter);

  await light.click();
  await expect.poll(glowing).toContain('drop-shadow');

  // Someone switches it off at the wall
  await deviceReports('BidCos-RF', 'LEQ0000001:1', 'STATE', false);
  await expect.poll(glowing).toBe('none');
});

test('zeigt Geräteprobleme aus der CCU an und aktualisiert den Status live', async ({ page }) => {
  await login(page);

  const problems = page.getByRole('list', { name: 'Geräte mit Problemen' });
  await expect(problems.getByText('Wandthermostat Flur')).toBeVisible();
  await expect(problems.getByText('Fensterkontakt Bad')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Geräte mit Problemen: 2' })).toBeVisible();

  await page.getByRole('link', { name: 'Räume' }).click();
  await page.getByText('Wohnzimmer').click();
  await page.getByText('Schalter', { exact: true }).click();
  await expect(page.getByText('Wohnzimmer Licht')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Batterie schwach' })).toHaveCount(0);

  await deviceReports('BidCos-RF', 'LEQ0000001:0', 'LOWBAT', true);
  await expect(page.getByRole('status').filter({ hasText: 'Batterie schwach' })).toBeVisible();
});

test('zeigt unbekannte Kanaltypen und Geräte ohne Raum unter „Alle Geräte“', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Alle Geräte' }).click();

  await page.getByText('SMOKE_DETECTOR', { exact: true }).click();
  await expect(page.getByText('Rauchmelder Flur')).toBeVisible();

  await page.getByText('ROTARY_HANDLE_TRANSCEIVER', { exact: true }).click();
  const handle = page.getByLabel('Fenstergriff Wohnzimmer');
  await expect(handle.getByText('2', { exact: true })).toBeVisible();

  // Window opened: the value arrives as event
  await deviceReports('HmIP-RF', '0000DBE9A5C1F2:1', 'STATE', 1);
  await expect(handle.getByText('1', { exact: true })).toBeVisible();
});
