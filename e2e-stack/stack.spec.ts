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

  await page.getByRole('button', { name: 'Meldungen: 3' }).click();
  const problems = page.getByRole('list', { name: 'Meldungen', exact: true });
  await expect(problems.getByText('Wandthermostat Flur')).toBeVisible();
  await expect(problems.getByText('Fensterkontakt Bad')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.goto('/room/1');
  await expect(page.getByText('Wohnzimmer Licht')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Batterie schwach' })).toHaveCount(0);

  await deviceReports('BidCos-RF', 'LEQ0000001:0', 'LOWBAT', true);
  await expect(page.getByRole('status').filter({ hasText: 'Batterie schwach' })).toBeVisible();
});

test('zeigt Geräte ohne Raum unter „Alle Geräte“', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Menü' }).click();
  await page.getByRole('button', { name: 'Alle Geräte' }).click();

  await expect(page.getByRole('heading', { name: 'Sicherheit' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Rauchmelder Flur' }).getByRole('status')).toHaveText('Alles ruhig');

  // The window handle as a picture with its state
  const handle = page.getByRole('group', { name: 'Fenstergriff Wohnzimmer' });
  await expect(handle.getByRole('status')).toHaveText('Offen');

  // Window tilted: the value arrives as event
  await deviceReports('HmIP-RF', '0000DBE9A5C1F2:1', 'STATE', 1);
  await expect(handle.getByRole('status')).toHaveText('Gekippt');
});

test('dimmt über die Dimmer-Kachel', async ({ page }) => {
  await login(page);
  await page.goto('/devices');

  // LEVEL is 0..1: shown and set in percent
  const brightness = page.getByRole('slider', { name: 'Helligkeit Dimmer Esstisch' });
  await expect(brightness).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('button', { name: 'Dimmer Esstisch: Aus' })).toBeVisible();

  // Eight steps of 5 %, sent once after the last key
  for (let i = 0; i < 8; i++) await brightness.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Dimmer Esstisch: An · 40 %' })).toBeVisible();

  // Survives a reload: the value went through XML-RPC to the (fake) CCU
  await page.reload();
  await expect(page.getByRole('slider', { name: 'Helligkeit Dimmer Esstisch' })).toHaveAttribute('aria-valuenow', '40');

  // A tap switches off, the next one on again at 40 %
  await page.getByRole('button', { name: 'Dimmer Esstisch: An · 40 %' }).click();
  await expect(page.getByRole('button', { name: 'Dimmer Esstisch: Aus' })).toBeVisible();
  await page.getByRole('button', { name: 'Dimmer Esstisch: Aus' }).click();
  await expect(page.getByRole('button', { name: 'Dimmer Esstisch: An · 40 %' })).toBeVisible();
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
  const select = settings.getByRole('combobox', { name: 'Entprellzeit (Einheit)' });
  await expect(select).toHaveValue('0');
  await select.selectOption({ label: '5S' });

  await page.getByRole('button', { name: 'Speichern (1)' }).click();
  const dialog = page.getByRole('dialog', { name: 'Änderungen speichern?' });
  await expect(dialog).toContainText('Entprellzeit (Einheit)');
  await expect(dialog).toContainText('100MS → 5S');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Einstellungen gespeichert')).toBeVisible();

  // Stored in the (fake) CCU
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Fenstergriff Wohnzimmer' }).getByRole('combobox', { name: 'Entprellzeit (Einheit)' }),
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
  await expect(settings.getByRole('combobox', { name: 'Entprellzeit (Einheit)' })).toBeVisible();

  // Kept across a reload
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Fenstergriff Wohnzimmer' }).getByRole('combobox', { name: 'Entprellzeit (Einheit)' }),
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
  await expect(list.getByRole('listitem')).toHaveCount(6);

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

test('bearbeitet das Wochenprogramm eines Thermostats', async ({ page }) => {
  await login(page);
  await page.goto('/trade/20');
  await page.getByRole('button', { name: 'Wochenprogramm' }).click();

  const sheet = page.getByRole('dialog', { name: 'Wochenprogramm' });
  await expect(sheet.getByRole('tab', { name: /Profil 1/ })).toHaveAttribute('aria-selected', 'true');
  await sheet.getByRole('button', { name: 'Montag' }).click();

  // Monday: 6:00–8:00 at 21 °C; one step warmer, then to all weekdays
  const monday = sheet.getByRole('region', { name: 'Montag' });
  await expect(monday.getByRole('listitem')).toHaveCount(5);
  await monday.getByRole('button', { name: 'Wärmer 06:00' }).click();
  await expect(monday.getByRole('listitem').nth(1)).toContainText('21,5 °C');
  await monday.getByRole('combobox', { name: 'Ende von 06:00' }).selectOption('08:30');
  await sheet.getByRole('button', { name: 'Auf Werktage kopieren' }).click();
  await expect(sheet.getByText('10 Änderungen')).toBeVisible();

  await sheet.getByRole('button', { name: 'Speichern' }).click();
  await page.getByRole('dialog', { name: 'Änderungen speichern?' }).getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Einstellungen gespeichert')).toBeVisible();

  // Stored in the (fake) CCU
  await page.reload();
  await page.getByRole('button', { name: 'Wochenprogramm' }).click();
  await page.getByRole('dialog', { name: 'Wochenprogramm' }).getByRole('button', { name: 'Freitag' }).click();
  const friday = page.getByRole('dialog', { name: 'Wochenprogramm' }).getByRole('region', { name: 'Freitag' });
  await expect(friday.getByRole('listitem').nth(1)).toContainText('06:00bis');
  await expect(friday.getByRole('listitem').nth(1)).toContainText('21,5 °C');
  await expect(friday.getByRole('combobox', { name: 'Ende von 06:00' })).toHaveValue('510');
});

test('installiert ein bereitliegendes Firmware-Update', async ({ page }) => {
  await login(page);
  await page.goto('/setup');

  // Only the window contact has newer firmware
  await page.getByRole('button', { name: /Nur mit Update \(1\)/ }).click();
  const table = page.getByRole('table', { name: 'Geräte' });
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table.getByRole('row').nth(1)).toContainText('1.0.121.2.6');
  await table.getByRole('link').first().click();

  const firmware = page.getByRole('region', { name: 'Firmware' });
  await expect(firmware.getByRole('status')).toHaveText(/Firmware 1\.2\.6 liegt auf dem Gerät bereit/);
  await firmware.getByRole('button', { name: 'Update installieren' }).click();
  await page.getByRole('dialog', { name: 'Firmware-Update' }).getByRole('button', { name: 'Update installieren' }).click();
  await expect(page.getByText('Update gestartet')).toBeVisible();

  await expect(firmware.getByRole('status')).toHaveText('Die Firmware ist aktuell.');
  await expect(firmware.getByRole('button', { name: 'Update installieren' })).toHaveCount(0);
  await expect(firmware.getByRole('definition').first()).toHaveText('1.2.6');
});

test('erstellt ein Backup und lädt es herunter', async ({ page }) => {
  await login(page);
  await page.goto('/setup/system');

  const panel = page.getByRole('region', { name: 'Backup' });
  await panel.getByRole('button', { name: 'Backup erstellen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Backup erstellen' });

  await dialog.getByLabel('Passwort').fill('falsch');
  await dialog.getByRole('button', { name: 'Backup erstellen' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();

  await dialog.getByLabel('Passwort').fill('secret');
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Backup erstellen' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('ccu3-webui-2026-10-03.sbk');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  expect(Buffer.concat(chunks).toString()).toContain('fake CCU backup');

  await expect(dialog).toHaveCount(0);
  await expect(panel.getByRole('status')).toContainText('ccu3-webui-2026-10-03.sbk');
});

test('bearbeitet das Wochenprogramm eines Schaltaktors', async ({ page }) => {
  await login(page);
  await page.goto('/device/HmIP-RF/00195F29B04142');
  await page.getByRole('button', { name: 'Wochenprogramm bearbeiten' }).click();

  const sheet = page.getByRole('dialog', { name: 'Zeitplan' });
  const points = sheet.getByRole('list', { name: 'Zeitplan' }).getByRole('listitem');
  await expect(points).toHaveCount(2);
  await expect(points.nth(0)).toContainText('06:00');
  await expect(points.nth(0)).toContainText('Mo–Fr');
  await expect(points.nth(0)).toContainText('An');
  await expect(points.nth(1)).toContainText('22:00');
  await expect(points.nth(1)).toContainText('Aus');

  // 22:00 → 21:30
  await points.nth(1).getByRole('button').click();
  let dialog = page.getByRole('dialog', { name: 'Schaltzeit' });
  await dialog.getByRole('combobox', { name: 'Stunde' }).selectOption('21');
  await dialog.getByRole('combobox', { name: 'Minute' }).selectOption('30');
  await dialog.getByRole('button', { name: 'Übernehmen' }).click();

  // A new one: weekends at sunrise + 30 min, on
  await sheet.getByRole('button', { name: 'Schaltzeit hinzufügen' }).click();
  dialog = page.getByRole('dialog', { name: 'Schaltzeit' });
  await dialog.getByRole('button', { name: 'Wochenende' }).click();
  await dialog.getByRole('radio', { name: 'Sonnenaufgang' }).click();
  await dialog.getByRole('combobox').selectOption('30');
  await dialog.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(sheet.getByText('2 Änderungen')).toBeVisible();

  await sheet.getByRole('button', { name: 'Speichern' }).click();
  await page.getByRole('dialog', { name: 'Änderungen speichern?' }).getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Einstellungen gespeichert')).toBeVisible();

  // Stored in the (fake) CCU
  await page.reload();
  await page.getByRole('button', { name: 'Wochenprogramm bearbeiten' }).click();
  const stored = page.getByRole('dialog', { name: 'Zeitplan' }).getByRole('list', { name: 'Zeitplan' }).getByRole('listitem');
  await expect(stored).toHaveCount(3);
  await expect(stored.filter({ hasText: 'Sonnenaufgang +30 min' })).toContainText('Wochenende');
  await expect(stored.filter({ hasText: '21:30' })).toContainText('Aus');
});

test('zeigt einen Alarm und bestätigt ihn in der CCU', async ({ page }) => {
  await login(page);
  await page.goto('/room/1');
  const banner = page.getByRole('alert', { name: 'Alarme' });
  await expect(banner).toContainText('Wasseralarm: Wasser erkannt');
  await banner.getByRole('button', { name: 'Bestätigen' }).click();
  await expect(banner).toHaveCount(0);

  // Acknowledged in the (fake) CCU: gone after a reload too
  await page.reload();
  await expect(page.getByText('Wohnzimmer Licht')).toBeVisible();
  await expect(page.getByRole('alert', { name: 'Alarme' })).toHaveCount(0);
});
