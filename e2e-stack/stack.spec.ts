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
  await page.getByRole('main').getByText('Wohnzimmer', { exact: true }).click();
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
  await page.getByRole('main').getByText('Wohnzimmer', { exact: true }).click();
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
  // Rendered from the paramset description the server reads over XML-RPC
  const handle = page.getByLabel('Fenstergriff Wohnzimmer');
  await expect(handle.getByText('OPEN', { exact: true })).toBeVisible();

  // Window tilted: the value arrives as event
  await deviceReports('HmIP-RF', '0000DBE9A5C1F2:1', 'STATE', 1);
  await expect(handle.getByText('TILTED', { exact: true })).toBeVisible();
});

test('dimmt über den generischen Renderer aus der Paramset-Beschreibung', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Alle Geräte' }).click();
  await page.getByText('DIMMER_VIRTUAL_RECEIVER', { exact: true }).click();

  // LEVEL is 0..1 with unit "100%": shown and entered in percent
  const dimmer = page.getByLabel('Dimmer Esstisch', { exact: true });
  const level = dimmer.getByRole('textbox', { name: 'LEVEL' });
  await expect(level).toHaveValue('0');
  // Enums by name: ACTIVITY_STATE and PROCESS are both STABLE
  await expect(dimmer.getByText('STABLE', { exact: true })).toHaveCount(2);
  // Write-only parameters like RAMP_TIME are not shown
  await expect(dimmer.getByText('RAMP_TIME')).toHaveCount(0);

  await level.fill('40');
  await level.press('Enter');

  // Survives a reload: the value went through ReGa to the (fake) CCU
  // (the group stays open, its state is stored)
  await page.reload();
  await expect(page.getByLabel('Dimmer Esstisch', { exact: true }).getByRole('textbox', { name: 'LEVEL' })).toHaveValue('40');
});

test('ändert Geräteeinstellungen als Administrator mit Vorschau', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Einrichten' }).click();
  await expect(page).toHaveURL(/\/setup$/);

  // Device list from all interfaces, searchable
  const table = page.getByRole('table');
  await expect(table.getByText('HmIP-SRH')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Suchen' }).fill('Fenstergriff');
  await expect(table.getByRole('row')).toHaveCount(2);
  await table.getByRole('link', { name: 'Fenstergriff Wohnzimmer' }).click();

  const settings = page.getByRole('region', { name: 'Fenstergriff Wohnzimmer' });
  const select = settings.getByRole('combobox', { name: 'EVENT_DELAY_UNIT' });
  await expect(select).toHaveValue('0');
  await select.selectOption({ label: '5S' });

  await page.getByRole('button', { name: 'Speichern (1)' }).click();
  const dialog = page.getByRole('dialog', { name: 'Änderungen speichern?' });
  await expect(dialog).toContainText('EVENT_DELAY_UNIT');
  await expect(dialog).toContainText('100MS → 5S');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Einstellungen gespeichert')).toBeVisible();

  // Stored in the (fake) CCU
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Fenstergriff Wohnzimmer' }).getByRole('combobox', { name: 'EVENT_DELAY_UNIT' }),
  ).toHaveValue('2');
});

test('zeigt Gästen die Einstellungen nur an', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/Benutzername/).fill('Gast');
  await page.getByLabel(/Passwort/).fill('gast');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'CCU Addon MUI' })).toBeVisible();

  // No menu entry; the page itself only shows the values
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('button', { name: 'Einrichten' })).toHaveCount(0);
  await page.goto('/device/HmIP-RF/0000DBE9A5C1F2');
  await expect(page.getByText('Nur Administratoren können Einstellungen ändern.')).toBeVisible();
  await expect(page.getByText('100MS')).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Speichern/ })).toHaveCount(0);
});

test('verlangt nach Ablauf des Admin-Tokens das Passwort erneut', async ({ page }) => {
  await login(page);
  // As if the 8 hours were over: only the long-lived token is left
  await page.evaluate(() => localStorage.removeItem('ccu-addon-mui_AdminToken'));
  await page.goto('/device/HmIP-RF/0000DBE9A5C1F2');

  const settings = page.getByRole('region', { name: 'Fenstergriff Wohnzimmer' });
  await expect(settings.getByText('100MS')).toBeVisible();
  await expect(settings.getByRole('combobox')).toHaveCount(0);

  await page.getByRole('button', { name: 'Passwort eingeben' }).click();
  const dialog = page.getByRole('dialog', { name: 'Passwort eingeben' });
  await dialog.getByLabel('Passwort').fill('falsch');
  await dialog.getByRole('button', { name: 'Bestätigen' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();

  await dialog.getByLabel('Passwort').fill('secret');
  await dialog.getByRole('button', { name: 'Bestätigen' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(settings.getByRole('combobox', { name: 'EVENT_DELAY_UNIT' })).toBeVisible();

  // Kept across a reload
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Fenstergriff Wohnzimmer' }).getByRole('combobox', { name: 'EVENT_DELAY_UNIT' }),
  ).toBeVisible();
});
