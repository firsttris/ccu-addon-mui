import { expect, Page, test } from '@playwright/test';
import { login } from './helpers';

// The pictures of the documentation (docs/screenshot-*.png) that need the
// server: setup, programs, diagrams. Not a test: `bun run docs:screenshots`
// takes them anew against the fake CCU, the others come from
// e2e/docs-screenshots.spec.ts.
test.skip(!process.env.DOCS, 'documentation screenshots are taken with bun run docs:screenshots');

const dark = async (page: Page) => page.addInitScript(() => localStorage.setItem('theme-dark', 'true'));

const take = async (page: Page, name: string) => {
  await page.evaluate(() => document.fonts.ready);
  // Tiles and lists load what they show a moment later
  await page.waitForTimeout(800);
  await page.screenshot({ path: `docs/screenshot-${name}.png`, animations: 'disabled' });
};

const shot = (name: string, size: { width: number; height: number }, steps: (page: Page) => Promise<void>) =>
  test(name, async ({ page }) => {
    await page.setViewportSize(size);
    await dark(page);
    await login(page);
    await steps(page);
    await take(page, name);
  });

shot('geraeteliste', { width: 1280, height: 640 }, async (page) => {
  await page.goto('/setup');
  await expect(page.getByText('Wohnzimmer Thermostat').first()).toBeVisible();
});

shot('geraet', { width: 1280, height: 780 }, async (page) => {
  await page.goto('/device/BidCos-RF/LEQ0000004');
  await expect(page.getByText('Komforttemperatur').first()).toBeVisible();
});

shot('anlernen', { width: 1280, height: 860 }, async (page) => {
  await page.goto('/setup/pairing');
  await expect(page.getByRole('button', { name: 'Übernehmen' }).first()).toBeVisible();
});

shot('heizgruppen', { width: 1280, height: 860 }, async (page) => {
  await page.goto('/setup/heating-groups');
  await expect(page.getByRole('heading').first()).toBeVisible();
});

shot('system', { width: 1280, height: 1470 }, async (page) => {
  await page.goto('/setup/system');
  await expect(page.getByText('Funkmodule').first()).toBeVisible();
});

shot('systemvariablen', { width: 1280, height: 800 }, async (page) => {
  await page.goto('/sysvars');
  await expect(page.getByText('Anwesenheit').first()).toBeVisible();
});

shot('programm', { width: 1280, height: 780 }, async (page) => {
  await page.goto('/program/1201');
  await expect(page.getByLabel('Name des Programms')).toHaveValue(/Rollläden/);
});

shot('verknuepfung', { width: 1280, height: 1060 }, async (page) => {
  await page.goto('/setup/links');
  const link = page.getByRole('listitem').filter({ hasText: 'Esstisch an' }).first();
  await link.getByRole('button', { name: 'Verhalten einstellen' }).click();
  await expect(link.getByRole('combobox', { name: 'Vorlage' })).toBeVisible();
  await link.scrollIntoViewIfNeeded();
});

shot('wochenprogramm', { width: 1280, height: 860 }, async (page) => {
  await page.goto('/trade/20');
  await page.getByRole('button', { name: 'Wochenprogramm' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Wochenprogramm' })).toBeVisible();
});

shot('anordnen', { width: 1280, height: 860 }, async (page) => {
  await page.goto('/favorites');
  await page.getByRole('button', { name: 'Anordnen' }).click();
  await expect(page.getByRole('button', { name: 'Fertig' })).toBeVisible();
});

shot('diagramme', { width: 1280, height: 800 }, async (page) => {
  // A logged channel: a new diagram takes over its values from the CCU's
  // history (the fake CCU has a day of them)
  await page.goto('/device/BidCos-RF/LEQ0000004');
  const logged = page.getByRole('group', { name: /LEQ0000004:1$/ }).getByLabel('protokolliert');
  if (!(await logged.isChecked())) await logged.check();
  await page.goto('/diagrams');
  await page.getByRole('button', { name: 'Neues Diagramm' }).click();
  const dialog = page.getByRole('dialog', { name: 'Neues Diagramm' });
  await dialog.getByLabel('Name').fill('Wohnzimmer Klima');
  await dialog.getByLabel('Standardzeitraum').selectOption('week');
  const search = dialog.getByRole('searchbox', { name: 'Datenquelle hinzufügen' });
  await search.fill('Wohnzimmer Thermostat');
  await dialog.getByRole('button', { name: 'Wohnzimmer Thermostat · Temperatur hinzufügen' }).click();
  await dialog.getByLabel('Darstellung Wohnzimmer Thermostat · Temperatur').selectOption('area');
  await search.fill('Wohnzimmer Thermostat');
  await dialog.getByRole('button', { name: 'Wohnzimmer Thermostat · Luftfeuchte hinzufügen' }).click();
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toHaveCount(0);
  // Without the toast of saving
  await page.reload();
  await expect(page.getByRole('region', { name: 'Wohnzimmer Klima' }).getByRole('img').first()).toBeVisible();
});
