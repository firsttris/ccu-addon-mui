import { Page } from '@playwright/test';
import { expect, test } from './helpers/coverageTest';
import { installWebSocketMock } from './helpers/websocketMock';

test.beforeEach(async ({ page }) => {
  await installWebSocketMock(page);
});

test('lädt Räume ohne echte CCU3-Verbindung', async ({ page }) => {
  // The start page is the first room, with all rooms as tabs
  await page.goto('/');
  await expect(page).toHaveURL(/\/room\/1$/);

  const tabs = page.getByRole('navigation', { name: /Räume|Rooms/ });
  await expect(tabs.getByRole('link', { name: 'Wohnzimmer' })).toHaveAttribute('aria-current', 'page');
  await tabs.getByRole('link', { name: 'Küche' }).click();
  await expect(page).toHaveURL(/\/room\/2$/);

  // Reloading the start page opens the room shown last
  await page.goto('/');
  await expect(page).toHaveURL(/\/room\/2$/);
});

test('lädt Trades und springt in Trade-Details mit Channels', async ({ page }) => {
  await page.goto('/trades');

  const tradeList = page.locator('ul').first();
  await expect(tradeList.getByText('Licht', { exact: true })).toBeVisible();
  await expect(tradeList.getByText('Heizung', { exact: true })).toBeVisible();

  await tradeList.getByText('Licht', { exact: true }).click();
  await expect(page).toHaveURL(/\/trade\/10$/);

  await expect(page.getByText('Flur Licht')).toBeVisible();
});

test('sendet setDatapoint und verarbeitet Event-Updates', async ({ page }) => {
  await page.goto('/room/1');

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

  await expect(page.getByText('Wohnzimmer Licht')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /Battery low|Batterie schwach|Not reachable|Nicht erreichbar/ })).toHaveCount(0);

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

type MockWindow = Window & {
  __wsMock?: {
    sentMessages: () => Array<{ type: string; value?: unknown; attribute?: string }>;
    failNextSet: (code: string) => void;
  };
};

const sentSetDatapoints = (page: Page) =>
  page.evaluate(() =>
    ((window as MockWindow).__wsMock?.sentMessages() ?? []).filter((m) => m.type === 'setDatapoint'),
  );

test('meldet einen fehlgeschlagenen Befehl und nimmt die Änderung zurück', async ({ page }) => {
  await page.goto('/room/1');
  await expect(page.getByText('Wohnzimmer Licht')).toBeVisible();

  await page.evaluate(() => (window as MockWindow).__wsMock?.failNextSet('UNREACH'));
  await page.getByText('Wohnzimmer Licht').click();

  await expect(page.getByRole('alert')).toHaveText(/Device not reachable|Gerät nicht erreichbar/);

  // Rolled back to "off": the next click tries to switch on again
  await page.getByText('Wohnzimmer Licht').click();
  await expect.poll(async () => (await sentSetDatapoints(page)).map((m) => m.value)).toEqual([true, true]);
});

test('zeigt Geräte mit Problemen in den Meldungen', async ({ page }) => {
  await page.goto('/room/2');
  await page.getByRole('button', { name: /(Notices|Meldungen): 2/ }).click();

  const list = page.getByRole('list', { name: /^(Notices|Meldungen)$/ });
  await expect(list.getByText('Wandthermostat Flur')).toBeVisible();
  await expect(list.getByText('Fensterkontakt Bad')).toBeVisible();
  await expect(list.getByText(/Not reachable|Nicht erreichbar/)).toHaveCount(1);
  await expect(list.getByText(/Battery low|Batterie schwach/)).toHaveCount(1);

  // Acknowledged messages disappear, the count follows
  await list.getByRole('button', { name: /(Acknowledge|Bestätigen): Fensterkontakt Bad/ }).click();
  await expect(list.getByText('Fensterkontakt Bad')).toHaveCount(0);
  // (behind the open sheet, hidden from the accessibility tree)
  await expect(page.getByRole('button', { name: /(Notices|Meldungen): 1/, includeHidden: true })).toBeAttached();

  await list.getByRole('link', { name: 'Wohnzimmer' }).click();
  await expect(page).toHaveURL(/\/room\/1$/);
});

test('zeigt Energiezähler zusammengefasst und keine Rohdaten', async ({ page }) => {
  await page.goto('/room/3');

  // One card for the four channels of the meter
  await expect(page.getByText(/Electricity|Strom$/)).toHaveCount(1);
  await expect(page.getByText('87 W')).toBeVisible();
  await expect(page.getByText(/^20[.,]054[.,]8 kWh$/)).toBeVisible();
  await expect(page.getByText(/^13[.,]678[.,]5 kWh$/)).toBeVisible();

  // The week profile has no control and must not appear as raw JSON
  await expect(page.getByText('Wochenprofil')).toHaveCount(0);
  await expect(page.getByText('WEEK_PROGRAM_CHANNEL_LOCKS')).toHaveCount(0);
});

test('öffnet die Tür nur mit bewussten Gesten', async ({ page }) => {
  await page.goto('/room/3');
  const door = page.getByRole('group', { name: 'Haustür' });
  await expect(door.getByRole('status')).toHaveText(/Gesperrt|Locked/);

  // A tap on "unlock" does nothing, it has to be held
  const unlock = door.getByRole('button', { name: /^(Unlock|Entsperren)$/ });
  await unlock.click();
  expect(await sentSetDatapoints(page)).toHaveLength(0);
  await unlock.hover();
  await page.mouse.down();
  await expect.poll(async () => (await sentSetDatapoints(page)).map((m) => [m.attribute, m.value])).toEqual([['STATE', true]]);
  await page.mouse.up();

  // Opening: the knob has to reach the end of its track
  const slider = door.getByRole('slider', { name: /Slide to open|Zum Öffnen schieben/ });
  await slider.press('ArrowRight');
  expect((await sentSetDatapoints(page)).map((m) => m.attribute)).toEqual(['STATE']);
  await slider.press('End');
  await expect
    .poll(async () => (await sentSetDatapoints(page)).map((m) => [m.attribute, m.value]))
    .toEqual([
      ['STATE', true],
      ['OPEN', true],
    ]);
  await expect(door.getByRole('status')).toHaveText(/Tür wird geöffnet|Opening the door/);

  // HmIP door lock drive: locking is a tap, it sets the target level
  const cellar = page.getByRole('group', { name: 'Kellertür' });
  await expect(cellar.getByRole('status')).toHaveText(/Entsperrt|Unlocked/);
  await cellar.getByRole('button', { name: /^(Lock|Sperren)$/ }).click();
  await expect
    .poll(async () => (await sentSetDatapoints(page)).at(-1))
    .toMatchObject({ attribute: 'LOCK_TARGET_LEVEL', value: 0 });
});

test('zeigt Fenster offen, gekippt und geschlossen', async ({ page }) => {
  await page.goto('/room/1');
  const handle = page.getByRole('group', { name: 'Fenstergriff Wohnzimmer' });
  await expect(handle.getByRole('status')).toHaveText(/^(Offen|Open)$/);
  await expect(page.getByRole('group', { name: 'Terrassentür' }).getByRole('status')).toHaveText(/^(Geschlossen|Closed)$/);
  await expect(page.getByText(/Fenster offen|Windows open/).locator('..')).toContainText('Fenstergriff Wohnzimmer');

  await page.evaluate(() => {
    (window as Window & { __wsMock?: { emitEvent: (e: unknown) => void } }).__wsMock?.emitEvent({
      channel: '0000DBE9A5C1F2:1',
      datapoint: 'STATE',
      value: 1,
    });
  });
  await expect(handle.getByRole('status')).toHaveText(/^(Gekippt|Tilted)$/);

  await page.goto('/room/2');
  await expect(page.getByRole('group', { name: 'Fenstergriff Küche' }).getByRole('status')).toHaveText(/^(Gekippt|Tilted)$/);
});

test('dimmt, färbt Licht und drückt Taster', async ({ page }) => {
  await page.goto('/room/1');

  // Dimmer: 60 %, one step down with the keyboard
  const dimmer = page.getByRole('slider', { name: /(Helligkeit|Brightness) Esstisch/ });
  await expect(dimmer).toHaveAttribute('aria-valuenow', '60');
  await dimmer.press('ArrowLeft');
  await expect
    .poll(async () => (await sentSetDatapoints(page)).map((m) => [m.attribute, m.value]))
    .toEqual([['LEVEL', 0.55]]);

  // Color light: a quick color sets hue and saturation
  await page.getByRole('button', { name: /(Farbe|Color) 120°/ }).click();
  await expect
    .poll(async () => (await sentSetDatapoints(page)).slice(1).map((m) => [m.attribute, m.value]))
    .toEqual([
      ['HUE', 120],
      ['SATURATION', 1],
    ]);

  // Push button: a tap is a short press, holding a long one
  const top = page.getByRole('button', { name: /^oben:/ });
  await top.click();
  await expect.poll(async () => (await sentSetDatapoints(page)).at(-1)?.attribute).toBe('PRESS_SHORT');
  await top.hover();
  await page.mouse.down();
  await expect.poll(async () => (await sentSetDatapoints(page)).at(-1)?.attribute).toBe('PRESS_LONG');
  await page.mouse.up();
  // Releasing after a long press sends nothing more
  await page.waitForTimeout(200);
  expect((await sentSetDatapoints(page)).filter((m) => m.attribute?.startsWith('PRESS'))).toHaveLength(2);
});

test('zeigt Kanäle ohne eigenes Control mit ihren Werten', async ({ page }) => {
  await page.goto('/room/1');

  // Rendered from the paramset description
  const datapoints = page.getByLabel('Neigungssensor Garage');
  await expect(datapoints).toBeVisible();
  await expect(datapoints.getByText('MOTION', { exact: true })).toBeVisible();
  await expect(datapoints.getByRole('switch', { name: 'MOTION_DETECTION_ACTIVE' })).toBeChecked();

  await page.evaluate(() => {
    (window as Window & { __wsMock?: { emitEvent: (e: unknown) => void } }).__wsMock?.emitEvent({
      channel: '0000DBE9A5C1F3:1',
      datapoint: 'MOTION',
      value: true,
    });
  });
  await expect(datapoints.getByText(/^(Yes|Ja)$/)).toBeVisible();

  // Fallback for everything the app can't do yet
  const webUILink = page.getByRole('link', { name: /Open in CCU WebUI|In alter WebUI öffnen/ });
  await expect(webUILink).toHaveAttribute('href', '/');
  await expect(webUILink).toHaveAttribute('target', '_blank');
});

test('listet unter „Alle Geräte“ auch Geräte ohne Raum', async ({ page }) => {
  await page.goto('/room/1');
  await page.getByRole('button', { name: /^(Menu|Menü)$/ }).click();
  await page.getByRole('button', { name: /All devices|Alle Geräte/ }).click();
  await expect(page).toHaveURL(/\/devices$/);

  await expect
    .poll(() =>
      page.evaluate(() => {
        const mock = (window as Window & {
          __wsMock?: { sentMessages: () => Array<{ type: string; all?: boolean }> };
        }).__wsMock;
        return mock?.sentMessages().some((m) => m.type === 'getChannels' && m.all === true);
      }),
    )
    .toBe(true);

  await expect(page.getByText('Rauchmelder Flur')).toBeVisible();

  // Channels from rooms and trades are listed as well
  await expect(page.getByText('Wohnzimmer Licht')).toBeVisible();
  await expect(page.getByText('Flur Licht')).toBeVisible();
});

test('zeigt die Anzahl der Geräte mit Problemen im Header', async ({ page }) => {
  await page.goto('/room/1');

  const badge = page.getByRole('button', { name: /(Notices|Meldungen): 2/ });
  await expect(badge).toBeVisible();
  await badge.click();
  await expect(page.getByRole('dialog').getByRole('list', { name: /^(Notices|Meldungen)$/ })).toBeVisible();
});
