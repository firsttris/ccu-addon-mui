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
  // Administrators see hidden variables too, marked, as in the WebUI's list
  // (systemvars.htm, EnumEnabledIDs)
  await expect(list.getByRole('listitem')).toHaveCount(7);
  await expect(list.getByRole('listitem').filter({ hasText: 'Intern' })).toContainText('unsichtbar');

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

test('stellt eine Direktverknüpfung über eine Vorlage der WebUI ein', async ({ page }) => {
  await login(page);
  await page.goto('/device/HmIP-RF/000855699C4F38');
  const list = page.getByRole('region', { name: 'Direktverknüpfungen' }).getByRole('list', { name: 'Direktverknüpfungen' });
  const item = list.getByRole('listitem').filter({ hasText: 'Esstisch an' });
  await item.getByRole('button', { name: 'Parameter' }).click();

  // A new link has the dimmer's default: on/off and brighter/darker
  const profile = item.getByRole('combobox', { name: 'Vorlage' });
  await expect(profile).toHaveValue('3');
  await profile.selectOption({ label: 'Treppenhauslicht' });
  await expect(item).toContainText('Das Licht wird durch kurzen oder langen Tastendruck');
  await item.getByRole('combobox', { name: 'Einschaltdauer', exact: true }).selectOption({ label: '5 min' });
  await item.getByRole('button', { name: /^Speichern \(\d+\)$/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Änderungen speichern?' });
  await expect(dialog).toContainText('Vorlage: Dimmer - ein/aus & heller/dunkler → Treppenhauslicht');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Einstellungen gespeichert')).toBeVisible();

  // Stored in the device: recognised again after a reload
  await page.reload();
  await item.getByRole('button', { name: 'Parameter' }).click();
  await expect(profile).toHaveValue('4');
  await expect(item.getByRole('combobox', { name: 'Einschaltdauer', exact: true })).toHaveValue('300');
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
  const level = item.getByRole('textbox', { name: 'Pegel im Zustand "ein"', exact: true });
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

test('zeigt die Favoriten des Benutzers und ändert sie in der CCU', async ({ page }) => {
  await login(page);
  await page.goto('/favorites');
  await expect(page).toHaveURL(/\/favorite\/1300$/);
  await expect(page.getByTitle('Küche Rollo')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Systemvariablen & Programme' })).toContainText('Rollläden abends schließen');

  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  await page.getByRole('searchbox', { name: 'Gerät, Variable oder Programm suchen' }).fill('Zirkulation');
  await page.getByRole('button', { name: 'Zur Liste hinzufügen: Zirkulationspumpe', exact: true }).click();
  await expect(page.getByRole('list', { name: 'In der Liste' })).toContainText('Zirkulationspumpe');
  await page.keyboard.press('Escape');

  // Stored in the (fake) CCU: still there after a reload
  await page.reload();
  await expect(page.getByTitle('Zirkulationspumpe')).toBeVisible();
});

test('legt fest, ob ein Schaltaktor als Lampe oder Schalter erscheint', async ({ page }) => {
  await login(page);
  // Without a choice: a switch, its name doesn't sound like a lamp
  await page.goto('/devices');
  const tile = page.getByRole('button', { name: /^Zirkulationspumpe: / });
  await expect(tile).toHaveAttribute('data-tile', 'switch');

  await page.goto('/device/HmIP-RF/00195F29B04142');
  const choice = page.getByRole('region', { name: 'Namen, Räume und Gewerke' }).getByLabel('Kachel 00195F29B04142:4');
  await expect(choice).toHaveValue('');
  await choice.selectOption({ label: 'Lampe' });
  await expect(page.getByText('Einstellungen gespeichert')).toBeVisible();

  // Stored in the CCU, so every device shows the lamp
  await page.goto('/devices');
  await expect(tile).toHaveAttribute('data-tile', 'light');
  await page.reload();
  await expect(tile).toHaveAttribute('data-tile', 'light');

  await page.goto('/device/HmIP-RF/00195F29B04142');
  await choice.selectOption({ label: 'Automatisch (nach Name und Gewerk)' });
  await expect(page.getByText('Einstellungen gespeichert')).toBeVisible();
});

test('legt Programme im Programm-Editor an, ändert und löscht sie', async ({ page }) => {
  await login(page);
  await page.goto('/programs');
  await page.getByRole('link', { name: 'Neues Programm' }).click();

  await page.getByLabel('Name des Programms').fill('Gäste kommen');
  const rule = page.getByRole('region', { name: 'Wenn …' });
  await rule.getByLabel('Art').first().selectOption({ label: 'Systemvariable' });
  await rule.getByLabel('Systemvariable').selectOption({ label: 'Anwesenheit' });
  await rule.getByLabel('Wert').selectOption({ label: 'anwesend' });
  const action = rule.getByLabel('Art').nth(1);
  await action.selectOption({ label: 'Skript' });
  await rule.getByLabel('Skript', { exact: true }).fill('WriteLine("Hallo");\nWriteLine(1);');
  await rule.getByLabel('Ausführen').selectOption({ label: 'verzögert um' });
  await rule.getByLabel('verzögert um', { exact: true }).fill('2');
  await rule.getByLabel('verzögert um (Einheit)').selectOption({ label: 'Minuten' });
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Einstellungen gespeichert')).toBeVisible();
  await expect(page).toHaveURL(/\/program\/\d+$/);

  // Stored in the (fake) CCU
  await page.reload();
  await expect(page.getByLabel('Name des Programms')).toHaveValue('Gäste kommen');
  await expect(rule.getByLabel('Wert')).toHaveValue('1');
  await expect(rule.getByLabel('Skript', { exact: true })).toHaveValue('WriteLine("Hallo");\nWriteLine(1);');
  await expect(rule.getByLabel('verzögert um', { exact: true })).toHaveValue('2');

  // The list has it, deleting removes it
  await page.goto('/programs');
  await page.getByRole('link', { name: 'Gäste kommen' }).click();
  await page.getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page).toHaveURL(/\/programs$/);
  await expect(page.getByRole('link', { name: 'Gäste kommen' })).toHaveCount(0);

  // An existing program: the time of its time control
  await page.getByRole('link', { name: 'Rollläden abends schließen' }).click();
  await expect(rule).toContainText('täglich, um 19:30');
  await rule.getByRole('button', { name: 'Zeitsteuerung bearbeiten' }).click();
  const timeDialog = page.getByRole('dialog', { name: 'Zeitsteuerung' });
  await timeDialog.getByLabel('tagsüber (Sonnenaufgang bis -untergang)').check();
  await timeDialog.getByLabel('Wiederholung', { exact: true }).selectOption({ label: 'wöchentlich' });
  await timeDialog.getByRole('button', { name: 'Sa' }).click();
  await timeDialog.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(rule).toContainText('wöchentlich am Mo, Di, Mi, Do, Fr, Sa, tagsüber');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Einstellungen gespeichert')).toBeVisible();
  await page.reload();
  await expect(rule).toContainText('wöchentlich am Mo, Di, Mi, Do, Fr, Sa, tagsüber');
  await expect(rule.getByLabel('Systemvariable')).toHaveValue('950');
});

test('listet alle Direktverknüpfungen in Einrichten und legt neue an', async ({ page }) => {
  await login(page);
  await page.goto('/setup');
  await page.getByRole('navigation', { name: 'Einrichten' }).getByRole('link', { name: 'Direktverknüpfungen' }).click();
  await expect(page).toHaveURL(/\/setup\/links$/);
  const list = page.getByRole('list', { name: 'Direktverknüpfungen' });
  await expect(list.getByRole('listitem').first()).toBeVisible();

  // A new one from the overview: the lower button to the dimmer
  const add = page.getByRole('region', { name: 'Verknüpfung anlegen' });
  await add.getByLabel('Gerät').selectOption({ label: 'Taster Esszimmer (000855699C4F38)' });
  const form = add.getByRole('form', { name: 'Verknüpfung anlegen' });
  await form.getByLabel('Kanal dieses Geräts').selectOption('000855699C4F38:2');
  await form.getByLabel('Partner').selectOption('00151BE9A1C2D3:4');
  await form.getByLabel('Name der Verknüpfung').fill('Übersicht-Test');
  await form.getByRole('button', { name: 'Verknüpfen' }).click();
  const item = list.getByRole('listitem').filter({ hasText: 'Übersicht-Test' });
  await expect(item).toBeVisible();

  // Search, parameters with the profiles, remove
  await page.getByRole('searchbox', { name: 'Suchen' }).fill('Übersicht');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await item.getByRole('button', { name: 'Parameter' }).click();
  await expect(item.getByRole('combobox', { name: 'Vorlage' })).toBeVisible();
  await item.getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('dialog', { name: 'Verknüpfung löschen' }).getByRole('button', { name: 'Löschen' }).click();
  await expect(item).toHaveCount(0);
});

test('stellt den Standort der CCU ein', async ({ page }) => {
  await login(page);
  await page.goto('/setup/system');
  const panel = page.getByRole('region', { name: 'Standort und Uhrzeit' });
  await expect(panel).toContainText('UTC+1');
  await expect(panel.getByLabel('Breitengrad')).toHaveValue('52.52');

  await panel.getByLabel('Breitengrad').fill('48,137154');
  await panel.getByLabel('Längengrad').fill('11.576124');
  await panel.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Einstellungen gespeichert')).toBeVisible();
  await page.reload();
  await expect(panel.getByLabel('Breitengrad')).toHaveValue('48.137154');
  await expect(panel.getByLabel('Längengrad')).toHaveValue('11.576124');

  // The fake CCU is no CCU: no restart from here
  await expect(page.getByRole('region', { name: 'Neustart' })).toContainText('nur, wenn das Add-on auf der CCU selbst läuft');
});

test('legt CCU-Benutzer an, ändert ihre Rechte und löscht sie', async ({ page }) => {
  await login(page);
  await page.goto('/setup/users');
  const panel = page.getByRole('region', { name: 'Benutzer' });
  await expect(panel.getByRole('row', { name: /Admin/ })).toBeVisible();

  await panel.getByRole('button', { name: 'Neuer Benutzer' }).click();
  const dialog = page.getByRole('dialog', { name: 'Neuer Benutzer' });
  await dialog.getByLabel('Name').fill('Anna Muster');
  await expect(dialog).toContainText('Anmeldename: AnnaMuster');
  await dialog.getByLabel('Berechtigung').selectOption({ label: 'Gast' });
  await dialog.getByLabel('Passwort', { exact: true }).fill('geheim1');
  await dialog.getByLabel('Passwort wiederholen').fill('anders');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Die Passwörter stimmen nicht überein');
  await dialog.getByLabel('Passwort wiederholen').fill('geheim1');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toHaveCount(0);

  const row = panel.getByRole('row', { name: /Anna Muster/ });
  await expect(row).toContainText('Gast');
  await expect(row).toContainText('gesetzt');

  await row.getByRole('button', { name: 'Bearbeiten AnnaMuster' }).click();
  const edit = page.getByRole('dialog', { name: 'Benutzer bearbeiten' });
  await edit.getByLabel('Berechtigung').selectOption({ label: 'Benutzer' });
  await edit.getByRole('button', { name: 'Speichern' }).click();
  await expect(row).toContainText('Benutzer');

  await row.getByRole('button', { name: 'Löschen AnnaMuster' }).click();
  await page.getByRole('dialog', { name: 'Benutzer löschen' }).getByRole('button', { name: 'Löschen' }).click();
  await expect(row).toHaveCount(0);
});

test('blendet Kanäle über die Option „sichtbar“ aus', async ({ page }) => {
  await login(page);
  await page.goto('/device/BidCos-RF/LEQ0000002');
  const options = page.getByRole('group', { name: 'Optionen LEQ0000002:1' });
  await expect(options.getByLabel('sichtbar')).toBeChecked();
  await expect(options.getByLabel('protokolliert')).not.toBeChecked();
  await options.getByLabel('sichtbar').click();
  await expect(options.getByLabel('sichtbar')).not.toBeChecked();

  await page.goto('/room/2');
  await expect(page.getByText('Küche Fenster')).toBeVisible();
  await expect(page.getByText('Küche Rollo')).toHaveCount(0);

  await page.goto('/device/BidCos-RF/LEQ0000002');
  await options.getByLabel('sichtbar').click();
  await expect(options.getByLabel('sichtbar')).toBeChecked();
  await page.goto('/room/2');
  await expect(page.getByText('Küche Rollo')).toBeVisible();
});

test('zeigt beim Laden Platzhalter statt einer leeren Tabelle', async ({ page }) => {
  // Hold back the device list until the placeholders were checked
  let hold = false;
  let held: (() => void)[] = [];
  await page.routeWebSocket(/.*/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((msg) => {
      if (hold && typeof msg === 'string' && msg.includes('"type":"listDevices"')) {
        held.push(() => server.send(msg));
        return;
      }
      server.send(msg);
    });
    server.onMessage((msg) => ws.send(msg));
  });
  await login(page);
  hold = true;
  await page.goto('/setup');
  const table = page.getByRole('table', { name: 'Geräte' });
  await expect(table.locator('[data-skeleton]').first()).toBeVisible();
  await expect(page.getByText('Nichts gefunden.')).toHaveCount(0);

  hold = false;
  held.forEach((send) => send());
  held = [];
  await expect(table.locator('[data-skeleton]')).toHaveCount(0);
  await expect(table.getByRole('row', { name: /LEQ0000001/ })).toBeVisible();
});

test('zeigt das Systemprotokoll der protokollierten Kanäle', async ({ page }) => {
  await login(page);
  await page.goto('/device/BidCos-RF/LEQ0000003');
  const options = page.getByRole('group', { name: 'Optionen LEQ0000003:1' });
  await options.getByLabel('protokolliert').click();
  await expect(options.getByLabel('protokolliert')).toBeChecked();

  await page.getByRole('link', { name: 'Systemprotokoll' }).click();
  const table = page.getByRole('table', { name: 'Systemprotokoll' });
  const row = table.getByRole('row', { name: /Flur Licht/ });
  await expect(row).toContainText('Zustand');
  await page.getByLabel('Suchen').fill('Flur');
  await expect(row).toBeVisible();

  await page.goto('/device/BidCos-RF/LEQ0000003');
  await options.getByLabel('protokolliert').click();
  await expect(options.getByLabel('protokolliert')).not.toBeChecked();
});

test('zeigt den Verlauf protokollierter Werte auf der Geräteseite', async ({ page }) => {
  await login(page);
  await page.goto('/device/BidCos-RF/LEQ0000004');
  const history = page.getByRole('region', { name: 'Verlauf' });
  await expect(history).toContainText('Kein Kanal dieses Geräts wird protokolliert');
  const options = page.getByRole('group', { name: 'Optionen LEQ0000004:1' });
  await options.getByLabel('protokolliert').click();
  await expect(options.getByLabel('protokolliert')).toBeChecked();

  await page.reload();
  await expect(history.getByRole('img', { name: 'Temperatur' })).toBeVisible();
  await expect(history.getByRole('img', { name: 'Luftfeuchte' })).toBeVisible();

  await options.getByLabel('protokolliert').click();
  await expect(options.getByLabel('protokolliert')).not.toBeChecked();
});

test('zeigt die Zusatzsoftware und startet ein Add-on neu', async ({ page }) => {
  await login(page);
  await page.goto('/setup/system');
  const panel = page.getByRole('region', { name: 'Zusatzsoftware' });
  const item = panel.getByRole('listitem').filter({ hasText: 'CUx-Daemon' });
  await expect(item).toContainText('2.11');
  await expect(item.getByRole('link', { name: 'Einstellungen' })).toHaveAttribute('href', /\/addons\/cuxd\/$/);

  await item.getByRole('button', { name: 'Neu starten CUx-Daemon' }).click();
  await page.getByRole('dialog', { name: 'Neu starten' }).getByRole('button', { name: 'Neu starten' }).click();
  await expect(page.getByText('CUx-Daemon wird neu gestartet')).toBeVisible();
});

test('stellt die Protokollierung ein und lädt die Protokolldateien herunter', async ({ page }) => {
  await login(page);
  await page.goto('/setup/system');
  const panel = page.getByRole('region', { name: 'Protokollierung' });
  await expect(panel.getByLabel('Logikschicht')).toHaveValue('2');
  await panel.getByLabel('HomeMatic IP').selectOption({ label: 'Information' });
  await panel.getByLabel('Syslog-Server').fill('192.168.0.10');
  await panel.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Gespeichert')).toBeVisible();
  await page.reload();
  await expect(panel.getByLabel('HomeMatic IP')).toHaveValue('INFO');
  await expect(panel.getByLabel('Syslog-Server')).toHaveValue('192.168.0.10');

  const downloading = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Protokolldateien herunterladen' }).click();
  const file = await downloading;
  expect(file.suggestedFilename()).toMatch(/\.log$/);
  const text = await (await file.createReadStream()).toArray();
  expect(Buffer.concat(text).toString()).toContain('fixture log line');

  await panel.getByLabel('HomeMatic IP').selectOption({ label: 'Nur Fehler' });
  await panel.getByLabel('Syslog-Server').fill('');
  await panel.getByRole('button', { name: 'Speichern' }).click();
  await expect(panel.getByLabel('Syslog-Server')).toHaveValue('');
});

test('testet ein Skript auf der Programmseite', async ({ page }) => {
  await login(page);
  await page.goto('/programs');
  await page.getByRole('button', { name: 'Skript testen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Skript testen' });
  await dialog.getByLabel('Skript').fill('WriteLine("Hallo");\nWrite("Welt");');
  await dialog.getByRole('button', { name: 'Ausführen' }).click();
  await expect(dialog.getByLabel('Ausgabe')).toHaveText('Hallo\nWelt');

  await dialog.getByLabel('Skript').fill('dom.Kaputt(');
  await dialog.getByRole('button', { name: 'Ausführen' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Syntaxfehler');
});

test('stellt Programme und Systemvariablen sichtbar und bedienbar ein', async ({ page }) => {
  await login(page);
  await page.goto('/programs');
  const item = page.getByRole('listitem').filter({ hasText: 'Alles aus' });
  await item.getByLabel('bedienbar Alles aus').click();
  await expect(item.getByLabel('bedienbar Alles aus')).not.toBeChecked();
  await item.getByLabel('sichtbar Alles aus').click();
  await expect(item.getByLabel('sichtbar Alles aus')).not.toBeChecked();
  await expect(item.getByText('unsichtbar')).toBeVisible();
  await page.reload();
  await expect(item.getByLabel('bedienbar Alles aus')).not.toBeChecked();
  await expect(item.getByLabel('sichtbar Alles aus')).not.toBeChecked();
  await item.getByLabel('bedienbar Alles aus').click();
  await expect(item.getByLabel('bedienbar Alles aus')).toBeChecked();
  await item.getByLabel('sichtbar Alles aus').click();
  await expect(item.getByLabel('sichtbar Alles aus')).toBeChecked();
  await expect(item.getByText('unsichtbar')).toHaveCount(0);

  await page.goto('/sysvars');
  const sysvar = page.getByRole('listitem').filter({ hasText: 'Notiz' });
  await sysvar.getByLabel('sichtbar Notiz').click();
  await expect(sysvar.getByLabel('sichtbar Notiz')).not.toBeChecked();
  await expect(sysvar.getByText('unsichtbar')).toBeVisible();
  await page.reload();
  await expect(sysvar.getByLabel('sichtbar Notiz')).not.toBeChecked();
  await sysvar.getByLabel('sichtbar Notiz').click();
  await expect(sysvar.getByLabel('sichtbar Notiz')).toBeChecked();
  await expect(sysvar.getByText('unsichtbar')).toHaveCount(0);
});

test('bearbeitet die Einstellungen einer Systemvariablen', async ({ page }) => {
  await login(page);
  await page.goto('/sysvars');
  const list = page.getByRole('list', { name: 'Systemvariablen' });
  await list.getByRole('button', { name: 'Außentemperatur bearbeiten' }).click();
  const dialog = page.getByRole('dialog', { name: 'Außentemperatur bearbeiten' });
  await expect(dialog.getByLabel('Minimum')).toHaveValue('-50');
  await dialog.getByLabel('Einheit').fill('K');
  await dialog.getByLabel('Beschreibung').fill('Fühler an der Nordseite');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toHaveCount(0);
  const item = list.getByRole('listitem').filter({ hasText: 'Außentemperatur' });
  await expect(item).toContainText('Fühler an der Nordseite');
  await expect(item).toContainText('K');

  await page.reload();
  await list.getByRole('button', { name: 'Außentemperatur bearbeiten' }).click();
  await expect(dialog.getByLabel('Einheit')).toHaveValue('K');
  await dialog.getByLabel('Einheit').fill('°C');
  await dialog.getByLabel('Beschreibung').fill('');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(item).not.toContainText('Nordseite');
});

test('stellt Zeitzone und Zeitserver ein', async ({ page }) => {
  await login(page);
  await page.goto('/setup/system');
  const panel = page.getByRole('region', { name: 'Zeitzone und Zeitserver' });
  await expect(panel.getByLabel('Zeitzone')).toHaveValue('CET/CEST');
  await expect(panel.getByLabel(/Zeitserver/)).toHaveValue('pool.ntp.org');
  // The fake CCU is no CCU: its clock is not set from here
  await expect(panel.getByRole('button', { name: 'Uhrzeit dieses Geräts übernehmen' })).toHaveCount(0);

  await panel.getByLabel('Zeitzone').selectOption('GMT/BST');
  await panel.getByRole('button', { name: 'Zeitzone übernehmen' }).click();
  await expect(page.getByText('Einstellungen gespeichert').first()).toBeVisible();
  await panel.getByLabel(/Zeitserver/).fill('ptbtime1.ptb.de fritz.box');
  await panel.getByRole('button', { name: 'Zeitserver übernehmen' }).click();
  await page.reload();
  await expect(panel.getByLabel('Zeitzone')).toHaveValue('GMT/BST');
  await expect(panel.getByLabel(/Zeitserver/)).toHaveValue('ptbtime1.ptb.de fritz.box');
  await expect(page.getByRole('region', { name: 'Standort und Uhrzeit' })).toContainText('GMT/BST');

  await panel.getByLabel('Zeitzone').selectOption('CET/CEST');
  await panel.getByRole('button', { name: 'Zeitzone übernehmen' }).click();
  await panel.getByLabel(/Zeitserver/).fill('pool.ntp.org');
  await panel.getByRole('button', { name: 'Zeitserver übernehmen' }).click();
  await expect(panel.getByRole('button', { name: 'Zeitserver übernehmen' })).toBeDisabled();
});

test('ordnet eine Systemvariable einem Kanal zu und zeigt sie beim Gerät', async ({ page }) => {
  await login(page);
  await page.goto('/sysvars');
  const list = page.getByRole('list', { name: 'Systemvariablen' });
  await list.getByRole('button', { name: 'Anwesenheit bearbeiten' }).click();
  const dialog = page.getByRole('dialog', { name: 'Anwesenheit bearbeiten' });
  await dialog.getByLabel('Kanalzuordnung').selectOption({ label: 'Wohnzimmer Thermostat' });
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toHaveCount(0);

  await page.goto('/device/BidCos-RF/LEQ0000004');
  const section = page.getByRole('region', { name: 'Systemvariablen' });
  await expect(section.getByRole('listitem')).toContainText('Anwesenheit');
  await expect(section.getByRole('listitem')).toContainText('Wohnzimmer Thermostat');
  await expect(section.getByRole('switch', { name: 'Anwesenheit' })).toBeVisible();

  await page.goto('/sysvars');
  await list.getByRole('button', { name: 'Anwesenheit bearbeiten' }).click();
  await dialog.getByLabel('Kanalzuordnung').selectOption({ label: 'keine' });
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto('/device/BidCos-RF/LEQ0000004');
  await expect(page.getByRole('region', { name: 'Programme' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Systemvariablen' })).toHaveCount(0);
});

test('ordnet einem Raum Kanäle zu und entfernt sie', async ({ page }) => {
  await login(page);
  await page.goto('/setup/groups');
  const rooms = page.getByRole('region', { name: 'Räume' });
  await rooms.getByRole('button', { name: 'Kanäle in Küche' }).click();
  const members = rooms.getByRole('list', { name: 'Kanäle in Küche' });
  await expect(members).toContainText('Küche Rollo');
  await expect(members).not.toContainText('Flur Licht');

  await rooms.getByRole('combobox', { name: 'Kanal wählen' }).selectOption({ label: 'Flur Licht (LEQ0000003:1)' });
  await rooms.getByRole('button', { name: 'Kanal zu Küche hinzufügen' }).click();
  await expect(members).toContainText('Flur Licht');
  await page.reload();
  await rooms.getByRole('button', { name: 'Kanäle in Küche' }).click();
  await expect(members).toContainText('Flur Licht');

  await members.getByRole('button', { name: 'Flur Licht entfernen' }).click();
  await expect(members).not.toContainText('Flur Licht');
});

test('blendet systeminterne Programme nur auf Wunsch ein', async ({ page }) => {
  await login(page);
  await page.goto('/programs');
  const list = page.getByRole('list', { name: 'Programme' });
  await expect(list).toContainText('Alles aus');
  await expect(list).not.toContainText('Tastensperre');
  await page.getByLabel('Systeminterne Programme anzeigen (1)').check();
  await expect(list).toContainText('Systemintern: Tastensperre');
});

test('zeigt die Heizgruppen mit ihren Mitgliedern', async ({ page }) => {
  await login(page);
  await page.goto('/setup');
  await page.getByRole('link', { name: 'Heizgruppen' }).click();
  const list = page.getByRole('list', { name: 'Heizgruppen' });
  const flur = list.getByRole('listitem', { name: 'Heizung Flur' });
  await expect(flur).toContainText('HomeMatic IP');
  await expect(flur).toContainText('Heizung Flur INT0000001');
  await expect(flur.getByRole('list', { name: 'Mitglieder von Heizung Flur' })).toContainText('Wandthermostat Flur');
  const wohnzimmer = list.getByRole('listitem', { name: 'Heizung Wohnzimmer' });
  await expect(wohnzimmer).toContainText('Einzelbedienung gesperrt');
  await wohnzimmer.getByRole('link', { name: 'Wohnzimmer Thermostat' }).click();
  await expect(page).toHaveURL(/\/device\/BidCos-RF\/LEQ0000004$/);
});

test('spielt ein Backup mit Sicherheitsschlüssel ein', async ({ page }) => {
  await login(page);
  await page.goto('/setup/system');
  const panel = page.getByRole('region', { name: 'Backup' });
  await panel.getByRole('button', { name: 'Backup einspielen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Backup einspielen' });

  await dialog.getByLabel('Backup-Datei (.sbk)').setInputFiles({ name: 'urlaub.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('holiday photos') });
  await dialog.getByLabel('Passwort').fill('secret');
  await dialog.getByRole('button', { name: 'Prüfen' }).click();
  await expect(dialog.getByRole('alert')).toContainText('kein Systembackup');

  const backup = 'fake CCU backup (usr_local.tar.gz, signature, key_index, firmware_version) signed with a user key';
  await dialog.getByLabel('Backup-Datei (.sbk)').setInputFiles({ name: 'ccu3.sbk', mimeType: 'application/octet-stream', buffer: Buffer.from(backup) });
  await dialog.getByRole('button', { name: 'Prüfen' }).click();
  await expect(dialog).toContainText('Das Backup „ccu3.sbk“ ist gültig');
  await dialog.getByLabel('System-Sicherheitsschlüssel des Backups').fill('falsch');
  await dialog.getByRole('button', { name: 'Einspielen und neu starten' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Sicherheitsschlüssel passt nicht');
  await dialog.getByLabel('System-Sicherheitsschlüssel des Backups').fill('Schluessel1');
  await dialog.getByRole('button', { name: 'Einspielen und neu starten' }).click();
  await expect(dialog.getByRole('status')).toContainText('Das Backup ist eingespielt');
});

test('spielt eine CCU-Firmware mit Lizenzbedingungen ein', async ({ page }) => {
  await login(page);
  await page.goto('/setup/system');
  await page.getByRole('region', { name: 'System' }).getByRole('button', { name: 'Firmware einspielen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Firmware einspielen' });

  await dialog.getByLabel('Firmware-Datei').setInputFiles({ name: 'urlaub.zip', mimeType: 'application/zip', buffer: Buffer.from('holiday photos') });
  await dialog.getByLabel('Passwort').fill('secret');
  await dialog.getByRole('button', { name: 'Hochladen und prüfen' }).click();
  await expect(dialog.getByRole('alert')).toContainText('keine Firmware');

  await dialog.getByLabel('Firmware-Datei').setInputFiles({ name: 'openccu.zip', mimeType: 'application/zip', buffer: Buffer.from('fake CCU firmware update with EULA') });
  await dialog.getByRole('button', { name: 'Hochladen und prüfen' }).click();
  await expect(dialog.getByLabel('Lizenzbedingungen', { exact: true })).toContainText('Lizenzbedingungen der Fake-Firmware');
  const install = dialog.getByRole('button', { name: 'Installieren und neu starten' });
  await expect(install).toBeDisabled();
  await dialog.getByLabel('Ich akzeptiere die Lizenzbedingungen').check();
  await install.click();
  await expect(dialog.getByRole('status')).toContainText('installiert die Firmware');
});

test('installiert eine Zusatzsoftware aus einer Datei', async ({ page }) => {
  await login(page);
  await page.goto('/setup/system');
  await page.getByRole('region', { name: 'Zusatzsoftware' }).getByRole('button', { name: 'Zusatzsoftware installieren' }).click();
  const dialog = page.getByRole('dialog', { name: 'Zusatzsoftware installieren' });
  await dialog.getByLabel('Datei (.tar.gz)').setInputFiles({ name: 'kaputt.tar.gz', mimeType: 'application/gzip', buffer: Buffer.from('broken') });
  await dialog.getByLabel('Passwort').fill('secret');
  await dialog.getByRole('button', { name: 'Installieren' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Error (2)');

  await dialog.getByLabel('Datei (.tar.gz)').setInputFiles({ name: 'cuxd.tar.gz', mimeType: 'application/gzip', buffer: Buffer.from('fake CCU add-on needs a reboot') });
  await dialog.getByRole('button', { name: 'Installieren' }).click();
  await expect(dialog.getByRole('status')).toContainText('startet zum Abschluss neu');
});

test('ändert das eigene Passwort', async ({ page }) => {
  await login(page);
  const change = async (current: string, next: string) => {
    await page.getByRole('button', { name: 'Menü' }).click();
    await page.getByRole('button', { name: 'Passwort ändern' }).click();
    const dialog = page.getByRole('dialog', { name: 'Passwort ändern' });
    await dialog.getByLabel('Aktuelles Passwort').fill(current);
    await dialog.getByLabel('Neues Passwort').fill(next);
    await dialog.getByLabel('Passwort wiederholen').fill(next);
    await dialog.getByRole('button', { name: 'Speichern' }).click();
    return dialog;
  };

  const wrong = await change('falsch', 'neu123');
  await expect(wrong.getByRole('alert')).toHaveText('Das aktuelle Passwort stimmt nicht');
  await wrong.getByRole('button', { name: 'Abbrechen' }).click();

  const right = await change('secret', 'neu123');
  await expect(right).toHaveCount(0);
  await expect(page.getByText('Passwort geändert')).toBeVisible();
  // Back again, for the other tests
  await change('neu123', 'secret');
  await expect(page.getByRole('dialog', { name: 'Passwort ändern' })).toHaveCount(0);
});

test('zeigt auf der Geräteseite die Programme, die das Gerät verwenden', async ({ page }) => {
  await login(page);
  await page.goto('/device/BidCos-RF/LEQ0000002');
  const section = page.getByRole('region', { name: 'Programme' });
  await expect(section).toContainText('Küche Rollo');
  await section.getByRole('link', { name: 'Rollläden abends schließen' }).click();
  await expect(page).toHaveURL(/\/program\/1201$/);

  await page.goto('/device/BidCos-RF/LEQ0000003');
  await expect(page.getByRole('region', { name: 'Programme' })).toContainText('Kein Programm verwendet dieses Gerät.');
});

test('drückt die virtuellen Taster der CCU', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Menü' }).click();
  await page.getByRole('button', { name: 'Einrichten' }).click();
  await page.getByRole('link', { name: 'Virtuelle Taster' }).click();
  const list = page.getByRole('list', { name: 'Virtuelle Taster' });
  await expect(list).toContainText('Alles aus');
  await expect(list).toContainText('Gute Nacht');
  await expect(list).not.toContainText('HM-RCV-50 BidCoS-RF:2');

  await page.getByLabel(/Alle 3 Taster zeigen/).click();
  await expect(list).toContainText('HM-RCV-50 BidCoS-RF:2');

  await list.getByRole('button', { name: 'Kurz Alles aus' }).click();
  await expect(page.getByText('Alles aus gedrückt')).toBeVisible();
});

test('führt den Funktionstest eines Geräts aus', async ({ page }) => {
  await login(page);
  await page.goto('/device/BidCos-RF/LEQ0000001');
  const section = page.getByRole('region', { name: 'Funktionstest' });
  await section.getByRole('button', { name: 'Funktionstest starten' }).click();
  await expect(section.getByRole('status')).toContainText('Das Gerät hat um', { timeout: 10000 });
});

test('speichert ein Programm als neues Programm', async ({ page }) => {
  await login(page);
  await page.goto('/program/1201');
  await expect(page.getByLabel('Name des Programms')).toHaveValue('Rollläden abends schließen');
  await page.getByRole('button', { name: 'Als neues Programm speichern' }).click();
  await expect(page.getByText('Als neues Programm gespeichert')).toBeVisible();
  await expect(page).not.toHaveURL(/\/program\/1201$/);
  await expect(page.getByLabel('Name des Programms')).toHaveValue('Rollläden abends schließen (Kopie)');

  // Remove the copy again
  await page.getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page).toHaveURL(/\/programs$/);
  await expect(page.getByText('Rollläden abends schließen (Kopie)')).toHaveCount(0);
});

test('stellt den Übertragungsmodus von BidCos-Kanälen ein', async ({ page }) => {
  await login(page);
  await page.goto('/device/BidCos-RF/LEQ0000001');
  const options = page.getByRole('group', { name: 'Optionen LEQ0000001:1' });
  const aes = options.getByLabel('gesichert (AES)');
  await expect(aes).not.toBeChecked();
  await aes.click();
  await expect(aes).toBeChecked();
  await page.reload();
  await expect(aes).toBeChecked();
  await aes.click();
  await expect(aes).not.toBeChecked();

  // HmIP always transmits secured
  await page.goto('/device/HmIP-RF/0000DBE9A5C1F2');
  await expect(page.getByRole('group', { name: 'Optionen 0000DBE9A5C1F2:1' })).toBeVisible();
  await expect(page.getByLabel('gesichert (AES)')).toHaveCount(0);
});

test('legt ein Diagramm an, zeigt die aufgezeichneten Werte und löscht es', async ({ page }) => {
  await login(page);
  await page.goto('/diagrams');
  await page.getByRole('button', { name: 'Neues Diagramm' }).click();
  const dialog = page.getByRole('dialog', { name: 'Neues Diagramm' });
  await dialog.getByLabel('Name').fill('Klima');
  await dialog.getByLabel('Standardzeitraum').selectOption('week');
  const search = dialog.getByRole('searchbox', { name: 'Datenquelle hinzufügen' });
  await search.fill('Wohnzimmer Thermostat');
  await dialog.getByRole('button', { name: 'Wohnzimmer Thermostat · Temperatur hinzufügen' }).click();
  await search.fill('Außen');
  await dialog.getByRole('button', { name: 'Außentemperatur hinzufügen' }).click();
  await dialog.getByLabel('Bezeichnung Außentemperatur').fill('Draußen');
  await dialog.getByLabel('Darstellung Wohnzimmer Thermostat · Temperatur').selectOption('area');
  await dialog.getByLabel('Achse Außentemperatur').selectOption('right');
  await dialog.getByRole('group', { name: 'Räume' }).getByRole('button', { name: 'Wohnzimmer' }).click();
  await expect(dialog.getByRole('list', { name: 'Datenquellen' }).getByRole('listitem')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toHaveCount(0);

  // The current values are recorded right away
  const card = page.getByRole('region', { name: 'Klima' });
  await expect(card.getByRole('img', { name: 'Klima' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Wohnzimmer Thermostat · Temperatur ein- oder ausblenden' })).toContainText('21,5 °C');
  await expect(card.getByRole('button', { name: 'Draußen ein- oder ausblenden' })).toContainText('12,5 °C');
  await expect(card.getByRole('button', { name: 'Woche' })).toHaveAttribute('aria-pressed', 'true');
  await expect(card.locator('[data-kind="area"]')).toHaveCount(1);

  // The same period before, dashed, and the chart in full screen
  await card.getByRole('button', { name: 'Vorzeitraum' }).click();
  await expect(card.getByRole('button', { name: 'Vorzeitraum' })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('button', { name: 'Vollbild' }).click();
  const full = page.getByRole('dialog', { name: 'Klima' });
  await expect(full.getByRole('img', { name: 'Klima' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(full).toHaveCount(0);

  // Hiding a series and choosing another period
  await card.getByRole('button', { name: 'Draußen ein- oder ausblenden' }).click();
  await expect(card.getByRole('button', { name: 'Draußen ein- oder ausblenden' })).toHaveAttribute('aria-pressed', 'false');
  await card.getByRole('button', { name: '24 h' }).click();
  await expect(card.getByRole('button', { name: '24 h' })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('button', { name: 'Früher' }).click();
  await expect(card.getByRole('button', { name: 'Später' })).toBeEnabled();

  // As a tile in the living room
  await page.goto('/room/1');
  const tile = page.getByRole('region', { name: 'Diagramme' }).getByRole('region', { name: 'Klima' });
  await expect(tile.getByRole('img', { name: 'Klima' })).toBeVisible();
  await expect(tile.getByRole('button', { name: 'Diagramm löschen' })).toHaveCount(0);
  await page.goto('/room/2');
  await expect(page.getByRole('region', { name: 'Diagramme' })).toHaveCount(0);

  await page.goto('/diagrams');
  await card.getByRole('button', { name: 'Diagramm löschen' }).click();
  await page.getByRole('dialog', { name: 'Diagramm löschen' }).getByRole('button', { name: 'Löschen' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByText('Noch keine Diagramme.')).toBeVisible();
});

test('stellt Energiepreise und Info-LED in den allgemeinen Einstellungen ein', async ({ page }) => {
  await login(page);
  await page.goto('/setup/system');
  const panel = page.getByRole('region', { name: 'Allgemeine Einstellungen' });
  await expect(panel.getByLabel('Währung')).toHaveValue('EUR');
  await panel.getByLabel('Strompreis').fill('0,3245');
  await panel.getByLabel('Gaspreis').fill('abc');
  await expect(panel.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  await panel.getByLabel('Gaspreis').fill('0,11');
  await panel.getByLabel('Info-LED bei Servicemeldungen').click();
  await panel.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Einstellungen gespeichert')).toBeVisible();
  await expect(panel.getByRole('meter', { name: 'Speicher' })).toBeVisible();

  await page.reload();
  const reloaded = page.getByRole('region', { name: 'Allgemeine Einstellungen' });
  await expect(reloaded.getByLabel('Strompreis')).toHaveValue('0,3245');
  await expect(reloaded.getByLabel('Gaspreis')).toHaveValue('0,11');
  await expect(reloaded.getByLabel('Info-LED bei Servicemeldungen')).not.toBeChecked();
  await expect(reloaded.getByLabel('Info-LED bei Alarmen')).toBeChecked();
});

test('legt Heizgruppen an, verschiebt ein Thermostat und löscht sie wieder', async ({ page }) => {
  await login(page);
  await page.goto('/setup/heating-groups');
  const list = page.getByRole('list', { name: 'Heizgruppen' });
  const editGroup = async (name: string) => {
    await list.getByRole('listitem', { name }).getByRole('button', { name: `Heizgruppe „${name}“ bearbeiten` }).click();
    return page.getByRole('dialog', { name: `Heizgruppe „${name}“ bearbeiten` });
  };

  await page.getByRole('button', { name: 'Neue Heizgruppe' }).click();
  const create = page.getByRole('dialog', { name: 'Neue Heizgruppe' });
  await create.getByLabel('Name').fill('Bad');
  await expect(create).toContainText('Schon in einer anderen Gruppe: Wandthermostat Flur');
  await create.getByRole('button', { name: 'Speichern' }).click();
  // The CCU's group administration needs a WebUI session once
  await create.getByLabel('Passwort').fill('secret');
  await create.getByRole('button', { name: 'Speichern' }).click();
  await expect(create).toHaveCount(0);
  await expect(list.getByRole('listitem', { name: 'Bad' })).toContainText('Noch keine Mitglieder');

  // The thermostat leaves its group, then joins the new one: no password now
  const flur = await editGroup('Heizung Flur');
  await flur.getByRole('button', { name: 'Wandthermostat Flur entfernen' }).click();
  await flur.getByRole('button', { name: 'Speichern' }).click();
  await expect(flur).toHaveCount(0);
  const bad = await editGroup('Bad');
  await bad.getByRole('button', { name: 'Wandthermostat Flur hinzufügen' }).click();
  await bad.getByLabel('Einzelbedienung gesperrt').click();
  await bad.getByRole('button', { name: 'Speichern' }).click();
  await expect(bad).toHaveCount(0);
  const badItem = list.getByRole('listitem', { name: 'Bad' });
  await expect(badItem.getByRole('list', { name: 'Mitglieder von Bad' })).toContainText('Wandthermostat Flur');
  await expect(badItem).toContainText('Einzelbedienung gesperrt');

  await badItem.getByRole('button', { name: 'Heizgruppe löschen' }).click();
  await page.getByRole('dialog', { name: 'Heizgruppe löschen' }).getByRole('button', { name: 'Löschen' }).click();
  await expect(list.getByRole('listitem', { name: 'Bad' })).toHaveCount(0);

  // Back as before, for a second run
  const back = await editGroup('Heizung Flur');
  await back.getByRole('button', { name: 'Wandthermostat Flur hinzufügen' }).click();
  await back.getByRole('button', { name: 'Speichern' }).click();
  await expect(list.getByRole('list', { name: 'Mitglieder von Heizung Flur' })).toContainText('Wandthermostat Flur');
});
