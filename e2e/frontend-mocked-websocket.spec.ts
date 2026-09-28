import { expect, test } from './helpers/coverageTest';
import { installWebSocketMock } from './helpers/websocketMock';

test.beforeEach(async ({ page }) => {
  await installWebSocketMock(page);
});

test('lädt Räume ohne echte CCU3-Verbindung', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'CCU Addon MUI' })).toBeVisible();
  await page.getByRole('link', { name: /Räume/ }).click();

  await expect(page.getByText('Wohnzimmer').first()).toBeVisible();
  await expect(page.getByText('Küche').first()).toBeVisible();
});

test('lädt Trades und springt in Trade-Details mit Channels', async ({ page }) => {
  await page.goto('/trades');

  const tradeList = page.locator('ul').first();
  await expect(tradeList.getByText('Licht', { exact: true })).toBeVisible();
  await expect(tradeList.getByText('Heizung', { exact: true })).toBeVisible();

  await tradeList.getByText('Licht', { exact: true }).click();
  await expect(page).toHaveURL(/\/trade\/10$/);

  const switchGroup = page.getByText(/Switch|Schalter/).first();
  await switchGroup.click();
  await expect(page.getByText('Flur Licht')).toBeVisible();
});

test('sendet setDatapoint und verarbeitet Event-Updates', async ({ page }) => {
  await page.goto('/room/1');

  const switchGroup = page.getByText(/Switch|Schalter/).first();
  await switchGroup.click();

  const channelCard = page.getByText('Wohnzimmer Licht');
  await expect(channelCard).toBeVisible();
  await channelCard.click();

  await expect.poll(async () => {
    return page.evaluate(() => {
      const mock = (window as Window & {
        __wsMock?: { sentMessages: () => Array<{ type: string }> };
      }).__wsMock;

      if (!mock) {
        return 0;
      }

      return mock.sentMessages().filter((message) => message.type === 'setDatapoint').length;
    });
  }).toBeGreaterThan(0);

  await page.evaluate(() => {
    const mock = (window as Window & {
      __wsMock?: {
        emitEvent: (event: { channel: string; datapoint: string; value: boolean }) => void;
      };
    }).__wsMock;

    mock?.emitEvent({
      channel: 'BidCos-RF.LEQ0000001:1',
      datapoint: 'STATE',
      value: true,
    });
  });

  await expect.poll(async () => {
    return page.evaluate(() => {
      const mock = (window as Window & {
        __wsMock?: { subscriptions: () => string[] };
      }).__wsMock;

      return mock?.subscriptions().length ?? 0;
    });
  }).toBeGreaterThan(0);
});

test('verarbeitet mehrere direkt aufeinanderfolgende Events', async ({ page }) => {
  await page.goto('/room/2');

  await page.getByText(/Blind|Rolladen/).first().click();
  await expect(page.getByText('Küche Fenster')).toBeVisible();

  // Both events are dispatched in the same task, like a multicall from the
  // CCU. Neither may get lost.
  await page.evaluate(() => {
    const mock = (window as Window & {
      __wsMock?: {
        emitEvent: (event: { channel: string; datapoint: string; value: number }) => void;
      };
    }).__wsMock;

    mock?.emitEvent({ channel: 'BidCos-RF.LEQ0000002:1', datapoint: 'LEVEL', value: 0.29 });
    mock?.emitEvent({ channel: 'BidCos-RF.LEQ0000005:1', datapoint: 'LEVEL', value: 0.75 });
  });

  // 0.29 * 100 must be shown rounded, not as 28.999999999999996
  await expect(page.getByText(/^29 % (open|geöffnet)$/)).toBeVisible();
  await expect(page.getByText(/^75 % (open|geöffnet)$/)).toBeVisible();
});

test('zeigt schwache Batterie und nicht erreichbare Geräte an', async ({ page }) => {
  await page.goto('/room/1');

  await page.getByText(/Switch|Schalter/).first().click();
  await expect(page.getByText('Wohnzimmer Licht')).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);

  // The maintenance channel must be subscribed to receive status events
  await expect.poll(async () => {
    return page.evaluate(() => {
      const mock = (window as Window & {
        __wsMock?: { subscriptions: () => string[] };
      }).__wsMock;
      return mock?.subscriptions() ?? [];
    });
  }).toContain('BidCos-RF.LEQ0000001:0');

  await page.evaluate(() => {
    const mock = (window as Window & {
      __wsMock?: {
        emitEvent: (event: { channel: string; datapoint: string; value: boolean }) => void;
      };
    }).__wsMock;

    // BidCos devices report LOWBAT instead of LOW_BAT
    mock?.emitEvent({ channel: 'BidCos-RF.LEQ0000001:0', datapoint: 'LOWBAT', value: true });
    mock?.emitEvent({ channel: 'BidCos-RF.LEQ0000001:0', datapoint: 'UNREACH', value: true });
  });

  await expect(page.getByRole('status').filter({ hasText: /Battery low|Batterie schwach/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /Not reachable|Nicht erreichbar/ })).toBeVisible();

  await page.evaluate(() => {
    const mock = (window as Window & {
      __wsMock?: {
        emitEvent: (event: { channel: string; datapoint: string; value: boolean }) => void;
      };
    }).__wsMock;

    mock?.emitEvent({ channel: 'BidCos-RF.LEQ0000001:0', datapoint: 'UNREACH', value: false });
  });

  await expect(page.getByRole('status').filter({ hasText: /Not reachable|Nicht erreichbar/ })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: /Battery low|Batterie schwach/ })).toBeVisible();
});
