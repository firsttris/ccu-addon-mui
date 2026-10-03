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
  await expect(page.getByRole('button', { name: 'Menü' })).toBeVisible();

  // Stays logged in after a reload (token)
  await page.reload();
  await expect(page.getByRole('button', { name: 'Menü' })).toBeVisible();
});

test('schaltet ein Licht und zeigt Änderungen vom Gerät live an', async ({ page }) => {
  await login(page);
  // The start page is the first room
  await expect(page.getByRole('navigation', { name: 'Räume' }).getByRole('link', { name: 'Wohnzimmer' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  const light = page.getByRole('button', { name: /^Wohnzimmer Licht:/ });
  await expect(light).toHaveAttribute('aria-pressed', 'false');

  await light.click();
  await expect(light).toHaveAttribute('aria-pressed', 'true');

  // Someone switches it off at the wall
  await deviceReports('BidCos-RF', 'LEQ0000001:1', 'STATE', false);
  await expect(light).toHaveAttribute('aria-pressed', 'false');
  await expect(light).toContainText('am Gerät');
});

test('zeigt Geräteprobleme aus der CCU an und aktualisiert den Status live', async ({ page }) => {
  await login(page);

  await page.getByRole('button', { name: 'Geräte mit Problemen: 2' }).click();
  const problems = page.getByRole('list', { name: 'Geräte mit Problemen' });
  await expect(problems.getByText('Wandthermostat Flur')).toBeVisible();
  await expect(problems.getByText('Fensterkontakt Bad')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.goto('/room/1');
  await expect(page.getByText('Wohnzimmer Licht')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Batterie schwach' })).toHaveCount(0);

  await deviceReports('BidCos-RF', 'LEQ0000001:0', 'LOWBAT', true);
  await expect(page.getByRole('status').filter({ hasText: 'Batterie schwach' })).toBeVisible();
});

test('zeigt unbekannte Kanaltypen und Geräte ohne Raum unter „Alle Geräte“', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Menü' }).click();
  await page.getByRole('button', { name: 'Alle Geräte' }).click();

  await expect(page.getByRole('heading', { name: 'Rauchmelder' })).toBeVisible();
  await expect(page.getByText('Rauchmelder Flur')).toBeVisible();

  // Rendered from the paramset description the server reads over XML-RPC
  const handle = page.getByLabel('Fenstergriff Wohnzimmer');
  await expect(handle.getByText('OPEN', { exact: true })).toBeVisible();

  // Window tilted: the value arrives as event
  await deviceReports('HmIP-RF', '0000DBE9A5C1F2:1', 'STATE', 1);
  await expect(handle.getByText('TILTED', { exact: true })).toBeVisible();
});

test('dimmt über den generischen Renderer aus der Paramset-Beschreibung', async ({ page }) => {
  await login(page);
  await page.goto('/devices');

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
  await page.reload();
  await expect(page.getByLabel('Dimmer Esstisch', { exact: true }).getByRole('textbox', { name: 'LEVEL' })).toHaveValue('40');
});

test('ändert Geräteeinstellungen als Administrator mit Vorschau', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Menü' }).click();
  await page.getByRole('button', { name: 'Einrichten' }).click();
  await expect(page).toHaveURL(/\/setup$/);

  // Device list from all interfaces, searchable
  const table = page.getByRole('table', { name: 'Geräte' });
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
  await expect(page.getByRole('button', { name: 'Menü' })).toBeVisible();

  // No menu entry; the page itself only shows the values
  await page.getByRole('button', { name: 'Menü' }).click();
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

test('benennt Kanäle um und ordnet sie Räumen zu', async ({ page }) => {
  await login(page);
  await page.goto('/device/BidCos-RF/LEQ0000001');

  const section = page.getByRole('region', { name: 'Namen, Räume und Gewerke' });
  const name = section.getByLabel('Name LEQ0000001:1');
  await expect(name).toHaveValue('Wohnzimmer Licht');
  await name.fill('Deckenlicht');
  await name.press('Enter');
  await expect(page.getByText('Umbenannt')).toBeVisible();

  // From the living room to the kitchen
  const rooms = section.getByRole('group', { name: 'Räume LEQ0000001:1' });
  await expect(rooms.getByLabel('Wohnzimmer')).toBeChecked();
  // (click, not check(): the box follows the cache a moment later)
  await rooms.getByLabel('Küche').click();
  await expect(rooms.getByLabel('Küche')).toBeChecked();
  await rooms.getByLabel('Wohnzimmer').click();
  await expect(rooms.getByLabel('Wohnzimmer')).not.toBeChecked();

  // The kitchen now shows the renamed light
  await page.goto('/room/2');
  await expect(page.getByText('Deckenlicht')).toBeVisible();
});

test('lernt an, übernimmt neue Geräte aus dem Posteingang und löscht Geräte', async ({ page }) => {
  await login(page);
  await page.goto('/setup/pairing');

  const pairing = page.getByRole('region', { name: 'Geräte anlernen' });
  await pairing.getByRole('button', { name: 'Anlernen starten (60 s)' }).click();
  await expect(pairing.getByRole('status')).toContainText(/Anlernen aktiv: (60|59|58) s/);
  await pairing.getByRole('button', { name: 'Beenden' }).click();
  await expect(pairing.getByRole('button', { name: 'Anlernen starten (60 s)' })).toBeVisible();

  // The window contact paired before is waiting in the inbox
  const inbox = pairing.getByRole('list', { name: 'Neue Geräte (Posteingang)' });
  await expect(inbox).toContainText('HmIP-SWDO');
  await inbox.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(page.getByText('Gerät übernommen')).toBeVisible();
  await expect(pairing.getByText('Keine neuen Geräte')).toBeVisible();

  // Delete it again
  await page.getByRole('navigation', { name: 'Einrichten' }).getByRole('link', { name: 'Geräte', exact: true }).click();
  await page.getByRole('table', { name: 'Geräte' }).getByRole('link', { name: 'HmIP-SWDO 0008DA8A9F1234' }).click();
  await page.getByRole('button', { name: 'Gerät löschen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gerät löschen' });
  await dialog.getByLabel('Gerät auf Werkseinstellungen zurücksetzen').check();
  await dialog.getByRole('button', { name: 'Löschen' }).click();
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByText('Gerät gelöscht')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Geräte' })).not.toContainText('0008DA8A9F1234');
});

test('setzt Systemvariablen', async ({ page }) => {
  await login(page);
  await page.goto('/sysvars');

  const list = page.getByRole('list', { name: 'Systemvariablen' });
  // Internal variables are hidden
  await expect(list.getByRole('listitem')).toHaveCount(5);

  const presence = list.getByRole('switch', { name: 'Anwesenheit' });
  await expect(presence).toHaveText('anwesend');
  await presence.click();
  await expect(presence).toHaveText('abwesend');

  await list.getByRole('combobox', { name: 'Heizmodus' }).selectOption('Nacht');
  const temperature = list.getByRole('textbox', { name: 'Außentemperatur' });
  await temperature.fill('21,5');
  await temperature.press('Enter');

  // Stored in the (fake) CCU
  await page.reload();
  await expect(list.getByRole('switch', { name: 'Anwesenheit' })).toHaveText('abwesend');
  await expect(list.getByRole('combobox', { name: 'Heizmodus' })).toHaveValue('2');
  await expect(list.getByRole('textbox', { name: 'Außentemperatur' })).toHaveValue('21.5');
});

test('führt Programme aus und schaltet sie als Administrator aktiv', async ({ page }) => {
  await login(page);
  await page.goto('/programs');

  const list = page.getByRole('list', { name: 'Programme' });
  await expect(list.getByRole('listitem').filter({ hasText: 'Urlaub' })).toContainText('inaktiv');
  await list.getByRole('button', { name: 'Ausführen Alles aus' }).click();
  await expect(page.getByText('Programm gestartet')).toBeVisible();

  await list.getByRole('checkbox', { name: 'Aktiv Urlaub' }).click();
  await expect(list.getByRole('listitem').filter({ hasText: 'Urlaub' })).not.toContainText('inaktiv');
});

test('meldet ein anderes Gerät ab', async ({ page, browser }) => {
  // A second device, e.g. the wall tablet
  const tabletContext = await browser.newContext({ locale: 'de-DE', serviceWorkers: 'block' });
  const tablet = await tabletContext.newPage();
  await login(tablet);

  await login(page);
  await page.goto('/setup/sessions');
  const sessions = page.getByRole('region', { name: 'Angemeldete Geräte' });
  await expect(sessions).toContainText('dieses Gerät');
  const rows = await sessions.getByRole('row').count();

  // Most recently used first: this device, then the tablet
  await sessions.getByRole('button', { name: /^Abmelden / }).first().click();
  await expect(page.getByText('Gerät abgemeldet')).toBeVisible();
  await expect(sessions.getByRole('row')).toHaveCount(rows - 1);

  // The tablet is disconnected and has to log in again
  await expect(tablet.getByRole('button', { name: 'Anmelden' })).toBeVisible({ timeout: 15000 });
  await tabletContext.close();
});

test('legt Direktverknüpfungen an, ändert ihre Parameter und löscht sie', async ({ page }) => {
  await login(page);
  await page.goto('/device/HmIP-RF/000855699C4F38');

  const section = page.getByRole('region', { name: 'Direktverknüpfungen' });
  const list = section.getByRole('list', { name: 'Direktverknüpfungen' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('Taster Esszimmer oben (000855699C4F38:1) → Dimmer Esstisch (00151BE9A1C2D3:4) · Esstisch an');

  // Lower button to the dimmer: only fitting partners are offered
  const form = section.getByRole('form', { name: 'Verknüpfung anlegen' });
  await form.getByLabel('Kanal dieses Geräts').selectOption('000855699C4F38:2');
  const partner = form.getByLabel('Partner');
  await expect(partner.locator('option')).toHaveCount(2);
  await partner.selectOption('00151BE9A1C2D3:4');
  await form.getByLabel('Name der Verknüpfung').fill('Esstisch dimmen');
  await form.getByRole('button', { name: 'Verknüpfen' }).click();
  await expect(page.getByText('Verknüpfung angelegt')).toBeVisible();
  await expect(list.getByRole('listitem')).toHaveCount(2);

  // Parameters of the new link on the dimmer's side
  const item = list.getByRole('listitem').filter({ hasText: 'Esstisch dimmen' });
  await item.getByRole('button', { name: 'Parameter' }).click();
  const level = item.getByRole('textbox', { name: 'SHORT_ON_LEVEL' });
  await expect(level).toHaveValue('100');
  await level.fill('40');
  await level.press('Enter');
  await item.getByRole('button', { name: 'Speichern (1)' }).click();
  const dialog = page.getByRole('dialog', { name: 'Änderungen speichern?' });
  await expect(dialog).toContainText('100 % → 40 %');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Einstellungen gespeichert')).toBeVisible();
  await expect(level).toHaveValue('40');

  // Remove the first one
  await list.getByRole('listitem').filter({ hasText: 'Esstisch an' }).getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('dialog', { name: 'Verknüpfung löschen' }).getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByText('Verknüpfung gelöscht')).toBeVisible();
  await expect(list.getByRole('listitem')).toHaveCount(1);
});

test('zeigt Versionen und Duty Cycle der Funkmodule', async ({ page }) => {
  await login(page);
  await page.goto('/setup/system');
  const system = page.getByRole('region', { name: 'System' });
  await expect(system).toContainText('Add-on-Version');
  await expect(system.getByRole('meter', { name: 'Duty Cycle BidCos-RF' })).toHaveAttribute('aria-valuenow', '12');
  await expect(system.getByRole('meter', { name: 'Duty Cycle HmIP-RF' })).toHaveAttribute('aria-valuenow', '3');
});

test('legt Räume und Systemvariablen an, benennt sie um und löscht sie', async ({ page }) => {
  await login(page);
  await page.goto('/setup/groups');

  const rooms = page.getByRole('region', { name: 'Räume' });
  await rooms.getByRole('textbox', { name: 'Neuer Raum' }).fill('Garage');
  await rooms.getByRole('button', { name: 'Hinzufügen' }).click();
  await expect(rooms.getByRole('listitem').filter({ hasText: 'Garage' })).toBeVisible();

  await rooms.getByRole('button', { name: 'Garage umbenennen' }).click();
  await rooms.getByRole('textbox', { name: 'Garage umbenennen' }).fill('Carport');
  await rooms.getByRole('textbox', { name: 'Garage umbenennen' }).press('Enter');
  await expect(rooms.getByRole('listitem').filter({ hasText: 'Carport' })).toBeVisible();

  // The new room is a tab on the dashboard
  await page.goto('/room/1');
  await expect(page.getByRole('navigation', { name: 'Räume' }).getByRole('link', { name: 'Carport' })).toBeVisible();

  await page.goto('/setup/groups');
  await page.getByRole('button', { name: 'Carport löschen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByText('Gelöscht')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Räume' }).getByText('Carport')).toHaveCount(0);

  await page.goto('/sysvars');
  await page.getByRole('button', { name: 'Neue Systemvariable' }).click();
  const dialog = page.getByRole('dialog', { name: 'Neue Systemvariable' });
  await dialog.getByLabel('Name', { exact: true }).fill('Gäste');
  await dialog.getByLabel('Art').selectOption({ label: 'Werteliste' });
  await dialog.getByRole('textbox', { name: /Werte/ }).fill('keine\nFamilie\nFreunde');
  await dialog.getByRole('button', { name: 'Anlegen' }).click();
  const list = page.getByRole('list', { name: 'Systemvariablen' });
  await list.getByRole('combobox', { name: 'Gäste' }).selectOption('Freunde');
  await page.reload();
  await expect(list.getByRole('combobox', { name: 'Gäste' })).toHaveValue('2');

  await list.getByRole('button', { name: 'Gäste löschen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(list.getByRole('combobox', { name: 'Gäste' })).toHaveCount(0);
});
