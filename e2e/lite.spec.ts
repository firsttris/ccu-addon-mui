import { expect, test } from './helpers/coverageTest';
import { installWebSocketMock } from './helpers/websocketMock';

// On openccu-lite there is no ReGa and no WebUI: the login says so
// (capabilities), and the app leaves out what the platform does not have
test.beforeEach(async ({ page }) => {
  await installWebSocketMock(page, { lite: true });
});

test('blendet auf openccu-lite Programme, Systemvariablen und Systemeinstellungen aus', async ({ page }) => {
  await page.goto('/room/1');
  await page.getByRole('button', { name: /^(Menü|Menu)$/ }).click();
  const menu = page.getByRole('dialog');
  // The way back to openccu-lite, for the app shown as the whole window
  await expect(menu.getByRole('link', { name: /^(Zurück zu openccu-lite|Back to openccu-lite)$/ })).toHaveAttribute('href', '/');
  await expect(menu.getByRole('link', { name: /^(Zurück zu openccu-lite|Back to openccu-lite)$/ })).toHaveAttribute('target', '_top');
  await expect(menu.getByRole('button', { name: /^(Diagramme|Diagrams)$/ })).toBeVisible();
  await expect(menu.getByRole('button', { name: /^(Programme|Programs)$/ })).toHaveCount(0);
  await expect(menu.getByRole('button', { name: /^(Systemvariablen|System variables)$/ })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.goto('/setup/system');
  const setup = page.getByRole('navigation', { name: /^(Einrichten|Setup)$/ });
  await expect(setup.getByRole('link', { name: /^(Diagramme|Diagrams)$/ })).toBeVisible();
  for (const name of [/^(Programme|Programs)$/, /^(Systemvariablen|System variables)$/, /^(Systemprotokoll|System protocol)$/, /^(LAN-Gateways|LAN gateways)$/]) {
    await expect(setup.getByRole('link', { name })).toHaveCount(0);
  }
  // The versions stay, the system settings are openccu-lite's own
  await expect(page.getByRole('region', { name: /^System$/ })).toBeVisible();
  await expect(page.getByRole('region', { name: /^Backup$/ })).toHaveCount(0);
  // Device firmware is on openccu-lite's Updates page
  await expect(page.getByRole('region', { name: /^(Geräte-Firmware|Device firmware)$/ })).toHaveCount(0);

  // A favorite list would show system variables and programs
  await page.goto('/favorite/1300');
  await expect(page.getByRole('main')).toBeVisible();

  // Nothing asks for what is not there
  const sent = await page.evaluate(() =>
    ((window as Window & { __wsMock?: { sentMessages: () => Array<{ type: string }> } }).__wsMock?.sentMessages() ?? []).map((m) => m.type),
  );
  expect(sent).not.toContain('getAlarmMessages');
  expect(sent).not.toContain('getSysvars');
  expect(sent).not.toContain('getPrograms');
});

test('zeigt auf openccu-lite, wo Automationen und Systemeinstellungen liegen', async ({ page }) => {
  await page.goto('/setup/system');
  const system = page.getByRole('region', { name: 'openccu-lite' });
  await expect(system.getByRole('link', { name: /^(Netzwerk|Network)$/ })).toHaveAttribute('href', '/system/network');
  await expect(system.getByRole('link', { name: /^(Sicherung|Backup)$/ })).toHaveAttribute('target', '_top');
  // No WebUI on openccu-lite: the help links to its documentation and licences
  const help = page.getByRole('region', { name: /^(Hilfe und Lizenzen|Help and licences)$/ });
  await expect(help.getByRole('link', { name: /openccu-lite/ }).first()).toBeVisible();
  await expect(help.locator('a[href="/licenses"]')).toHaveCount(1);
  await expect(help.locator('a[href$="licenseinfo.htm"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /alter WebUI|old WebUI/ })).toHaveCount(0);
  // The add-on is updated through openccu-lite's add-ons page
  await expect(page.getByRole('link', { name: /Zusatzsoftware von openccu-lite|openccu-lite's add-ons page/ })).toHaveAttribute('href', '/addons');

  // Programs: where automations go instead
  await page.getByRole('navigation', { name: /^(Einrichten|Setup)$/ }).getByRole('link', { name: /^(Automationen|Automations)$/ }).click();
  const automation = page.getByRole('region', { name: /^(Automationen|Automations)$/ });
  await expect(automation.getByRole('link', { name: /Node-RED/ })).toHaveAttribute('href', '/addons/red/');
  await automation.getByRole('link', { name: /^(Direktverknüpfungen|Direct links)$/ }).click();
  await expect(page).toHaveURL(/\/setup\/links$/);
});


test('zeigt im lokalen Schlüsselmodus, wie HmIP-Geräte anzulernen sind', async ({ page }) => {
  await page.goto('/setup/pairing');
  await expect(page.getByRole('note')).toContainText(/SGTIN/);
  // The pairing with the label's key is open right away
  await expect(page.getByText('SGTIN', { exact: true })).toBeVisible();
});
