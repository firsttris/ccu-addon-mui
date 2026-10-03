import { Page, expect } from '@playwright/test';
import { FAKE_CCU_URL } from '../playwright.stack.config';

// Back to the fixture, so every test starts from the same state
export const resetFakeCCU = async () => {
  const response = await fetch(`${FAKE_CCU_URL}/fake/reset`, { method: 'POST' });
  expect(response.ok).toBe(true);
};

// A device reports a value, e.g. a window being opened
export const deviceReports = async (iface: string, address: string, datapoint: string, value: unknown) => {
  const response = await fetch(`${FAKE_CCU_URL}/fake/set`, {
    method: 'POST',
    body: JSON.stringify({ interface: iface, address, datapoint, value }),
  });
  expect(response.ok).toBe(true);
};

export const login = async (page: Page) => {
  await page.goto('/');
  await page.getByLabel(/Benutzername/).fill('Admin');
  await page.getByLabel(/Passwort/).fill('secret');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('button', { name: 'Menü' })).toBeVisible();
};
