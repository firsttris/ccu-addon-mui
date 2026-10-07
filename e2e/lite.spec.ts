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

  // Nothing asks for what is not there
  const sent = await page.evaluate(() =>
    ((window as Window & { __wsMock?: { sentMessages: () => Array<{ type: string }> } }).__wsMock?.sentMessages() ?? []).map((m) => m.type),
  );
  expect(sent).not.toContain('getAlarmMessages');
});
