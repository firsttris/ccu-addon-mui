import { expect, test } from './helpers/coverageTest';
import { installWebSocketMock } from './helpers/websocketMock';

// The add-on's server delivers the app's scripts (lighttpd forwards
// /addons/mui/assets/ to it). When it isn't running, lighttpd answers 503:
// index.html says so instead of staying white.
test('sagt, dass der Server nicht läuft, wenn die Skripte der App nicht laden', async ({ page }) => {
  await page.route('**/src/main.tsx', (route) => route.fulfill({ status: 503, body: '' }));
  await page.goto('/rooms');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText(/MUI cannot be loaded|MUI lässt sich nicht laden/);
  await expect(alert).toContainText(/Restart the add-on|Starten Sie das Add-on neu/);
  await expect(alert.getByRole('link')).toHaveAttribute('href', /installation\.html#h%C3%A4ufige-probleme$/);
  // Shown once, even if more than one file fails
  await expect(alert).toHaveCount(1);

  // Reloading once the server runs again brings up the app
  await page.unroute('**/src/main.tsx');
  await installWebSocketMock(page);
  await alert.getByRole('button', { name: /Reload|Neu laden/ }).click();
  await expect(page.getByText('Wohnzimmer').first()).toBeVisible();
  await expect(page.getByText(/MUI cannot be loaded|MUI lässt sich nicht laden/)).toHaveCount(0);
});

test('zeigt den Hinweis nicht, wenn die App lädt', async ({ page }) => {
  await installWebSocketMock(page);
  await page.goto('/rooms');
  await expect(page.getByText('Wohnzimmer').first()).toBeVisible();
  await expect(page.getByText(/MUI cannot be loaded|MUI lässt sich nicht laden/)).toHaveCount(0);
});
