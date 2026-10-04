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

test('zeigt Eingänge je nach Kanalmodus', async ({ page }) => {
  await page.goto('/devices');
  const emit = (channel: string, datapoint: string, value: unknown) =>
    page.evaluate(
      (e) => (window as Window & { __wsMock?: { emitEvent: (e: unknown) => void } }).__wsMock?.emitEvent(e),
      { channel, datapoint, value },
    );

  // Wired as a contact: open or closed
  const gate = page.getByRole('group', { name: 'Gartentor' });
  await expect(gate).toContainText(/Kontakt|Contact/);
  await expect(gate.getByRole('status')).toHaveText(/Geschlossen|Closed/);
  await emit('0019A0C9B3E2D1:1', 'STATE', true);
  await expect(gate.getByRole('status')).toHaveText(/^(Offen|Open)$/);

  // No channel mode stored: a key, presses light up
  const bell = page.getByRole('group', { name: 'Klingeltaster' });
  await expect(bell).toContainText(/Taster|Button/);
  await expect(bell.getByRole('status')).toHaveText(/Wartet auf Signal|Waiting for a signal/);
  await emit('0019A0C9B3E2D2:1', 'PRESS_LONG', true);
  await expect(bell.getByRole('status')).toHaveText(/Lang gedrückt|Pressed long/);

  // Like the WebUI, the tile only shows; nothing is sent
  await bell.click();
  expect(await sentSetDatapoints(page)).toHaveLength(0);
});

test('bedient Melder und Garagentor', async ({ page }) => {
  await page.goto('/devices');

  // Smoke detector: calm, the test has to be held and sends SMOKE_TEST
  const smoke = page.getByRole('group', { name: 'Rauchmelder Flur' });
  await expect(smoke.getByRole('status')).toHaveText(/Alles ruhig|All quiet/);
  const test = smoke.getByRole('button', { name: /Rauchtest|Smoke test/ });
  await test.click();
  expect(await sentSetDatapoints(page)).toHaveLength(0);
  await test.hover();
  await page.mouse.down();
  await expect.poll(async () => (await sentSetDatapoints(page)).at(-1)).toMatchObject({ attribute: 'SMOKE_DETECTOR_COMMAND', value: 3 });
  await page.mouse.up();

  // Smoke reported: the tile turns to alarm
  await page.evaluate(() => {
    (window as Window & { __wsMock?: { emitEvent: (e: unknown) => void } }).__wsMock?.emitEvent({
      channel: '000A1B2C3D4E5F:1',
      datapoint: 'SMOKE_DETECTOR_ALARM_STATUS',
      value: 1,
    });
  });
  await expect(smoke.getByRole('status')).toHaveText(/Rauch erkannt|Smoke detected/);

  // Motion detector: detection can be switched off
  const motion = page.getByRole('group', { name: 'Bewegungsmelder Eingang' });
  await expect(motion.getByRole('status')).toHaveText(/^(Bewegung|Motion)$/);
  await motion.getByRole('switch').click();
  await expect.poll(async () => (await sentSetDatapoints(page)).at(-1)).toMatchObject({ attribute: 'MOTION_DETECTION_ACTIVE', value: false });

  // Garage door: closing is a tap (command 3, as in the WebUI)
  const garage = page.getByRole('group', { name: 'Garagentor' });
  await expect(garage.getByRole('status')).toHaveText(/Geschlossen|Closed/);
  await garage.getByRole('button', { name: /^(Lüften|Ventilate)$/ }).click();
  await expect.poll(async () => (await sentSetDatapoints(page)).at(-1)).toMatchObject({ attribute: 'DOOR_COMMAND', value: 4 });
  await expect(garage.getByRole('status')).toHaveText(/Öffnet|Opening/);

  // Water detector
  const water = page.getByRole('group', { name: 'Wassermelder Heizung' });
  await expect(water.getByRole('status')).toHaveText(/Trocken|Dry/);
  await page.evaluate(() => {
    (window as Window & { __wsMock?: { emitEvent: (e: unknown) => void } }).__wsMock?.emitEvent({
      channel: '00319BE9A8B9C1:1',
      datapoint: 'WATERLEVEL_DETECTED',
      value: true,
    });
  });
  await expect(water.getByRole('status')).toHaveText(/Wasser erkannt|Water detected/);
});

test('zeigt Zutritte und sperrt Benutzer', async ({ page }) => {
  await page.goto('/devices');
  const access = page.getByRole('group', { name: /^(Zutritt|Access)$/ });
  await expect(access.getByRole('status')).toHaveText(/3 von 4|3 of 4/);

  // Someone used the reader: the event names the user
  await page.evaluate(() => {
    (window as Window & { __wsMock?: { emitEvent: (e: unknown) => void } }).__wsMock?.emitEvent({
      channel: '002BE0C98ECD57:1',
      datapoint: 'ACCESS_AUTHORIZATION',
      value: 1,
    });
  });
  await expect(access.getByRole('status')).toHaveText(/(Zutritt gewährt|Access granted) · (Benutzer|User) 1/);

  await access.getByRole('switch', { name: /(Berechtigt|Authorised): (Benutzer|User) 1/ }).click();
  await expect.poll(async () => (await sentSetDatapoints(page)).at(-1)).toMatchObject({ attribute: 'STATE', value: false });

  // Bus voltages of the wired access point
  await expect(page.getByRole('group', { name: 'HmIPW-DRAP' })).toContainText(/24[.,]4 V/);
});

test('bedient BidCos-Thermostat, Lamellen und zeigt die Sirene', async ({ page }) => {
  await page.goto('/devices');

  // HM-CC-RT-DN: set point SET_TEMPERATURE, manual mode via MANU_MODE
  const radiator = page.getByRole('group', { name: 'Heizkörper Gästezimmer' });
  await expect(radiator).toContainText(/(Ventil|Valve) 34 %/);
  await radiator.getByRole('button', { name: /(Temperatur erhöhen|Increase temperature)/i }).click();
  await expect.poll(async () => (await sentSetDatapoints(page)).at(-1)).toMatchObject({ attribute: 'SET_TEMPERATURE', value: 21.5 });
  await radiator.getByRole('button', { name: /^(Automatisch|Automatic)$/ }).click();
  await expect.poll(async () => (await sentSetDatapoints(page)).at(-1)?.attribute).toBe('MANU_MODE');

  // Venetian blind: slats behind their chip
  await page.getByText(/(Lamellen|Slats) · 50 %/).click();
  const slats = page.getByRole('slider', { name: /(Lamellen|Slats) Raffstore Büro/ });
  await slats.press('ArrowRight');
  await expect.poll(async () => (await sentSetDatapoints(page)).at(-1)).toMatchObject({ attribute: 'LEVEL_2', value: 0.55 });
  // Roller shutters (LEVEL_2 empty) have no slats
  await expect(page.getByText(/(Lamellen|Slats) ·/)).toHaveCount(1);

  await expect(page.getByRole('group', { name: 'Sirene Flur' }).getByRole('status')).toHaveText(/Ruhig|Quiet/);
});

test('zeigt Favoritenlisten und bearbeitet sie', async ({ page }) => {
  await page.goto('/favorites');

  // The first list with the room view's tiles, its variables and programs
  await expect(page).toHaveURL(/\/favorite\/1300$/);
  await expect(page.getByRole('navigation', { name: /^(Favoriten|Favorites)$/ })).toContainText('Gäste');
  await expect(page.getByText('Wohnzimmer Licht')).toBeVisible();
  await expect(page.getByText('Flur Licht')).toBeVisible();
  await expect(page.getByText('Fenstergriff Wohnzimmer')).toHaveCount(0);
  const logic = page.getByRole('list', { name: /Systemvariablen|System variables/ });
  await expect(logic).toContainText('Anwesenheit');
  await logic.getByRole('button', { name: /(Ausführen|Run) Rollläden abends schließen/ }).click();

  // Remove a channel, add another one
  await page.getByRole('button', { name: /^(Bearbeiten|Edit)$/ }).click();
  const inList = page.getByRole('list', { name: /^(In der Liste|In the list)$/ });
  await inList.getByRole('button', { name: /(Aus der Liste entfernen|Remove from list): Flur Licht/ }).click();
  await expect(inList).not.toContainText('Flur Licht');
  await page.getByRole('searchbox', { name: /suchen|Search/ }).fill('Fenstergriff');
  await page.getByRole('button', { name: /(Zur Liste hinzufügen|Add to list): Fenstergriff Wohnzimmer/ }).click();
  await expect(inList).toContainText('Fenstergriff Wohnzimmer');
  await page.keyboard.press('Escape');
  await expect(page.getByTitle('Fenstergriff Wohnzimmer')).toBeVisible();
  await expect(page.getByText('Flur Licht')).toHaveCount(0);

  // A new list opens with its editor; deleting it goes back to the first
  await page.getByRole('button', { name: /^(Neue Liste|New list)$/ }).click();
  await page.getByRole('textbox', { name: /^(Name der Liste|Name of the list)$/ }).fill('Urlaub');
  await page.getByRole('button', { name: /^(Hinzufügen|Add)$/ }).click();
  await expect(page).toHaveURL(/\/favorite\/1400/);
  await expect(page.getByRole('heading', { name: /^(Liste bearbeiten|Edit list)$/ })).toBeVisible();
  await page.getByRole('button', { name: /^(Urlaub löschen|Delete Urlaub)$/ }).click();
  await page.getByRole('dialog', { name: /Urlaub/ }).getByRole('button', { name: /^(Löschen|Delete)$/ }).click();
  await expect(page).toHaveURL(/\/favorite\/1300$/);

  const sent = await page.evaluate(() =>
    ((window as Window & { __wsMock?: { sentMessages: () => Array<{ type: string }> } }).__wsMock?.sentMessages() ?? [])
      .map((m) => m.type)
      .filter((type) => /^(create|rename|delete|add|remove)Favorite|runProgram/.test(type)),
  );
  expect(sent).toEqual(['runProgram', 'removeFavoriteItem', 'addFavoriteItem', 'createFavorite', 'deleteFavorite']);
});

test('zeigt Änderungen an Systemvariablen, die der Server meldet', async ({ page }) => {
  await page.goto('/favorite/1300');
  const logic = page.getByRole('list', { name: /Systemvariablen|System variables/ });
  await expect(logic).toContainText(/anwesend/);

  // A program in the CCU changes it: no reload, the server sends the list
  await page.evaluate(() =>
    (window as Window & { __wsMock?: { setSysvar: (id: number, value: unknown) => void } }).__wsMock?.setSysvar(950, false),
  );
  await expect(logic).toContainText(/abwesend/);
});

test('öffnet als Startseite die zuletzt gezeigte Ansicht oder die Favoriten', async ({ page }) => {
  // The view shown last: a room, then a favorite list
  await page.goto('/room/2');
  await expect(page.getByRole('navigation', { name: /^(Räume|Rooms)$/ })).toBeVisible();
  await page.goto('/');
  await expect(page).toHaveURL(/\/room\/2$/);
  await page.goto('/favorite/1301');
  await expect(page.getByTitle('Flur Licht')).toBeVisible();
  await page.goto('/');
  await expect(page).toHaveURL(/\/favorite\/1301$/);

  // Chosen in the menu: always the favorites
  await page.goto('/room/1');
  await page.getByRole('button', { name: /^(Menü|Menu)$/ }).click();
  await page.getByRole('radiogroup', { name: /^(Startseite|Start page)$/ }).getByRole('radio', { name: /^(Favoriten|Favorites)$/ }).click();
  await page.keyboard.press('Escape');
  await page.goto('/');
  await expect(page).toHaveURL(/\/favorite\/1301$/);
});

test('ordnet die Kacheln eines Raums per Drag & Drop an', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/room/1');
  await page.getByRole('button', { name: /^(Anordnen|Arrange)$/ }).click();
  const tiles = page.locator('[data-tile-key]');
  await expect(tiles.first()).toBeVisible();
  const first = tiles.first();
  const key = await first.getAttribute('data-tile-key');
  const box = (await first.boundingBox())!;

  // Drag the first tile to the right by a few columns
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 30, { steps: 10 });
  await page.mouse.move(box.x + 420, box.y + 30, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await page.locator(`[data-tile-key="${key}"]`).boundingBox())!.x).toBeGreaterThan(box.x + 100);

  await page.getByRole('button', { name: /^(Fertig|Done)$/ }).click();
  const stored = await page.evaluate(() =>
    ((window as Window & { __wsMock?: { sentMessages: () => Array<{ type: string; id?: number; layout?: string }> } }).__wsMock?.sentMessages() ?? [])
      .filter((m) => m.type === 'setLayout'),
  );
  expect(stored).toHaveLength(1);
  expect(stored[0].id).toBe(1);
  expect(JSON.parse(stored[0].layout!).layouts.lg.some((t: { i: string; x: number }) => t.i === key && t.x > 0)).toBe(true);

  // Arranged after a reload too
  await page.reload();
  await expect(page.locator(`[data-tile-key="${key}"]`)).toBeVisible();
  expect((await page.locator(`[data-tile-key="${key}"]`).boundingBox())!.x).toBeGreaterThan(box.x + 100);

  // Back to the sections
  await page.getByRole('button', { name: /^(Anordnen|Arrange)$/ }).click();
  await page.getByRole('button', { name: /^(Automatisch anordnen|Arrange automatically)$/ }).click();
  await expect(page.locator('[data-tile-key]')).toHaveCount(0);
});

test('zeigt Alarme und bestätigt sie', async ({ page }) => {
  await page.addInitScript(() => {
    // Before the app asks for them
    const set = () =>
      (window as Window & { __wsMock?: { setAlarms: (a: unknown[]) => void } }).__wsMock?.setAlarms([
        { id: 958, name: 'Wasseralarm', active: true, counter: 1, firstTime: '2026-01-15 09:12:00', lastTime: '2026-01-15 09:12:00', channel: 'Wassermelder Keller', roomName: 'Keller', message: 'Wasser erkannt' },
        { id: 954, name: 'Alarmzone 1', active: false, counter: 2, firstTime: '2026-01-14 22:00:00', lastTime: '2026-01-14 22:05:00', message: 'nicht ausgelöst' },
      ]);
    window.addEventListener('DOMContentLoaded', set);
  });
  await page.goto('/room/1');

  // The newest alarm above the dashboard, the count in the header
  const banner = page.getByRole('alert', { name: /^(Alarme|Alarms)$/ });
  await expect(banner).toContainText('Wasseralarm: Wasser erkannt');
  await expect(banner).toContainText('Wassermelder Keller');
  await expect(page.getByRole('button', { name: /(Alarme|Alarms): 2/ })).toBeVisible();

  await banner.getByRole('button', { name: /^(Bestätigen|Acknowledge)$/ }).click();
  await expect.poll(() => page.evaluate(() =>
    ((window as Window & { __wsMock?: { sentMessages: () => Array<{ type: string; id?: number }> } }).__wsMock?.sentMessages() ?? [])
      .filter((m) => m.type === 'acknowledgeAlarmMessage').map((m) => m.id))).toEqual([958]);

  // The other one is over but not acknowledged yet
  await expect(banner).toContainText('Alarmzone 1');
  await page.getByRole('button', { name: /(Alarme|Alarms): 1/ }).click();
  const list = page.getByRole('list', { name: /^(Alarme|Alarms)$/ });
  await expect(list).toContainText(/Vorbei|Over/);
  await list.getByRole('button', { name: /(Bestätigen|Acknowledge): Alarmzone 1/ }).click();
  await expect(page.getByRole('alert', { name: /^(Alarme|Alarms)$/ })).toHaveCount(0);
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
