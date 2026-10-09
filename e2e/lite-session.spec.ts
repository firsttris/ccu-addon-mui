import { expect, test } from './helpers/coverageTest';
import { installWebSocketMock } from './helpers/websocketMock';

// openccu-lite's session expired: only its own login page renews it

test('schickt bei abgelaufener Sitzung zur Anmeldung von openccu-lite', async ({ page }) => {
  await installWebSocketMock(page, { lite: true, sessionExpired: true });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText(/Sitzung abgelaufen|Session expired/);
  await expect(page.getByRole('link', { name: /Bei openccu-lite anmelden|Sign in to openccu-lite/ })).toHaveAttribute('href', '/login');
  // Not the app's own login form, which could never succeed there
  await expect(page.getByLabel(/^(Benutzername|Username)$/)).toHaveCount(0);
});
