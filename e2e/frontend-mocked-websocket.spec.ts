import type { Page } from '@playwright/test';
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

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const mock = (
          window as Window & {
            __wsMock?: { sentMessages: () => Array<{ type: string }> };
          }
        ).__wsMock;

        if (!mock) {
          return 0;
        }

        return mock.sentMessages().filter((message) => message.type === 'setDatapoint').length;
      });
    })
    .toBeGreaterThan(0);

  await page.evaluate(() => {
    const mock = (
      window as Window & {
        __wsMock?: {
          emitEvent: (event: { channel: string; datapoint: string; value: boolean }) => void;
        };
      }
    ).__wsMock;

    mock?.emitEvent({
      channel: 'BidCos-RF.LEQ0000001:1',
      datapoint: 'STATE',
      value: true,
    });
  });

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const mock = (
          window as Window & {
            __wsMock?: { subscriptions: () => string[] };
          }
        ).__wsMock;

        return mock?.subscriptions().length ?? 0;
      });
    })
    .toBeGreaterThan(0);
});

test('verarbeitet mehrere direkt aufeinanderfolgende Events', async ({ page }) => {
  await page.goto('/room/2');

  await expect(page.getByText('Küche Fenster')).toBeVisible();

  // Both events are dispatched in the same task, like a multicall from the
  // CCU. Neither may get lost.
  await page.evaluate(() => {
    const mock = (
      window as Window & {
        __wsMock?: {
          emitEvent: (event: { channel: string; datapoint: string; value: number }) => void;
        };
      }
    ).__wsMock;

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
  await expect(
    page.getByRole('status').filter({ hasText: /Battery low|Batterie schwach|Not reachable|Nicht erreichbar/ }),
  ).toHaveCount(0);

  // The maintenance channel must be subscribed to receive status events
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const mock = (
          window as Window & {
            __wsMock?: { subscriptions: () => string[] };
          }
        ).__wsMock;
        return mock?.subscriptions() ?? [];
      });
    })
    .toContain('BidCos-RF.LEQ0000001:0');

  await page.evaluate(() => {
    const mock = (
      window as Window & {
        __wsMock?: {
          emitEvent: (event: { channel: string; datapoint: string; value: boolean }) => void;
        };
      }
    ).__wsMock;

    // BidCos devices report LOWBAT instead of LOW_BAT
    mock?.emitEvent({ channel: 'BidCos-RF.LEQ0000001:0', datapoint: 'LOWBAT', value: true });
    mock?.emitEvent({ channel: 'BidCos-RF.LEQ0000001:0', datapoint: 'UNREACH', value: true });
  });

  await expect(page.getByRole('status').filter({ hasText: /Battery low|Batterie schwach/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /Not reachable|Nicht erreichbar/ })).toBeVisible();

  await page.evaluate(() => {
    const mock = (
      window as Window & {
        __wsMock?: {
          emitEvent: (event: { channel: string; datapoint: string; value: boolean }) => void;
        };
      }
    ).__wsMock;

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
  page.evaluate(() => ((window as MockWindow).__wsMock?.sentMessages() ?? []).filter((m) => m.type === 'setDatapoint'));

test('meldet einen fehlgeschlagenen Befehl und nimmt die Änderung zurück', async ({ page }) => {
  await page.goto('/room/1');
  await expect(page.getByText('Wohnzimmer Licht')).toBeVisible();

  await page.evaluate(() => (window as MockWindow).__wsMock?.failNextSet('FORBIDDEN'));
  await page.getByText('Wohnzimmer Licht').click();

  await expect(page.getByRole('alert')).toHaveText(/Guests may not control devices|Gäste dürfen keine Geräte bedienen/);

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
  await expect
    .poll(async () => (await sentSetDatapoints(page)).map((m) => [m.attribute, m.value]))
    .toEqual([['STATE', true]]);
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
  await expect(page.getByRole('group', { name: 'Terrassentür' }).getByRole('status')).toHaveText(
    /^(Geschlossen|Closed)$/,
  );
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
  await expect(page.getByRole('group', { name: 'Fenstergriff Küche' }).getByRole('status')).toHaveText(
    /^(Gekippt|Tilted)$/,
  );
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

test('bedient Bewässerung und Fensterantriebe', async ({ page }) => {
  await page.goto('/devices');
  const last = async () => (await sentSetDatapoints(page)).at(-1);

  // Irrigation: open, and open for 10 minutes (ON_TIME first, then STATE)
  const water = page.getByRole('group', { name: 'Bewässerung Beet' });
  await expect(water.getByRole('status')).toHaveText(/Geschlossen|Closed/);
  await water.getByRole('button', { name: /^(Öffnen|Open)$/ }).click();
  await expect.poll(last).toMatchObject({ attribute: 'STATE', value: true });
  await expect(water.getByRole('status')).toHaveText(/Wasser läuft|Water running/);
  await water.getByRole('button', { name: /(Für 10 min öffnen|Open for 10 min)/ }).click();
  await expect
    .poll(async () => (await sentSetDatapoints(page)).slice(-2))
    .toMatchObject([
      { attribute: 'ON_TIME', value: 600 },
      { attribute: 'STATE', value: true },
    ]);

  // The water meter with the device's units
  const meter = page.getByRole('group', { name: 'Wasserzähler Beet' });
  await expect(meter).toContainText('l/h');
  await expect(meter).toContainText(/1[.,]284[.,]5 l/);

  // Window drive: open; Winmatic: locked, lock again after opening
  const drive = page.getByRole('group', { name: 'Oberlicht Treppenhaus' });
  await expect(drive.getByRole('status')).toHaveText(/Geschlossen|Closed/);
  await drive.getByRole('button', { name: /^(Öffnen|Open)$/ }).click();
  await expect.poll(last).toMatchObject({ attribute: 'LEVEL', value: 1 });
  const winmatic = page.getByRole('group', { name: 'Dachfenster Bad' });
  await expect(winmatic.getByRole('status')).toHaveText(/Verriegelt|Locked/);
  await winmatic.getByRole('button', { name: /^(Öffnen|Open)$/ }).click();
  await expect(winmatic.getByRole('status')).toHaveText(/^(Offen|Open)$/);
  await winmatic.getByRole('button', { name: /^(Verriegeln|Lock)$/ }).click();
  await expect.poll(last).toMatchObject({ attribute: 'LEVEL', value: -0.005 });
  await winmatic.getByRole('button', { name: /^(Stopp|Stop)$/ }).click();
  await expect.poll(last).toMatchObject({ attribute: 'STOP', value: true });
});

test('zeigt Nebenkanäle von Fußbodenheizung, Türschloss und LEDs', async ({ page }) => {
  await page.goto('/devices');
  const last = async () => (await sentSetDatapoints(page)).at(-1);

  // Floor heating pump: running, humidity limiter active, switchable
  const pump = page.getByRole('group', { name: 'Fußbodenheizung Pumpe' });
  await expect(pump.getByRole('status')).toHaveText(/Pumpe läuft|Pump running/);
  await expect(pump).toContainText(/Feuchtebegrenzer|Humidity limiter/);
  await pump.getByRole('switch', { name: /Pumpe|Pump/ }).click();
  await expect.poll(last).toMatchObject({ attribute: 'STATE', value: false });

  // Door lock drive: door state with calibration, auto relock, users
  const door = page.getByRole('group', { name: 'Haustür Zustand' });
  await expect(door.getByRole('status')).toHaveText(/Tür geschlossen|Door closed/);
  await door.getByRole('button', { name: /kalibrieren|Calibrate/ }).click();
  await expect.poll(last).toMatchObject({ attribute: 'CALIBRATE_DOOR_STATE', value: true });
  const relock = page.getByRole('group', { name: 'Haustür Auto-Relock' });
  await expect(relock.getByRole('status')).toHaveText(/Auto-Relock an|Auto relock on/);
  await relock.getByRole('switch').click();
  await expect.poll(last).toMatchObject({ attribute: 'AUTO_RELOCK_STATE', value: false });
  const users = page.getByRole('group', { name: 'Haustür', exact: true });
  await expect(users.getByRole('switch', { name: /Anna/ })).toBeChecked();
  await users.getByRole('switch', { name: /Ben/ }).click();
  await expect.poll(last).toMatchObject({ attribute: 'PERMISSION_STATE', value: true });

  // Lock sensor and status LED (color, behaviour)
  await expect(page.getByRole('group', { name: 'Riegelkontakt Keller' }).getByRole('status')).toHaveText(
    /Gesperrt|Locked/,
  );
  await page.getByLabel(/(Verhalten|Behaviour): Status-LED Flur/).selectOption('5');
  await expect.poll(last).toMatchObject({ attribute: 'COLOR_BEHAVIOUR', value: 5 });
});

test('stellt Servos und schaltet den Alarmausgang', async ({ page }) => {
  await page.goto('/devices');
  const last = async () => (await sentSetDatapoints(page)).at(-1);

  // The transmitter reports where the servo stands
  await expect(page.getByRole('group', { name: 'Lüftungsklappe Ist' }).getByRole('status')).toHaveText(
    /(Links|Left) · 25 %/,
  );

  // Ramp first, then the position (one step right of 25 %)
  const servo = page.getByRole('group', { name: 'Lüftungsklappe', exact: true });
  const ramp = servo.getByRole('slider', { name: /(Fahrzeit|Travel time)/ });
  await ramp.focus();
  await page.keyboard.press('ArrowRight');
  await expect(servo).toContainText('1 s');
  await servo.getByRole('slider', { name: /Position/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await sentSetDatapoints(page)).slice(-2))
    .toMatchObject([
      { attribute: 'RAMP_TIME', value: 1 },
      { attribute: 'LEVEL', value: 0.255 },
    ]);

  // Alarm output of the water safety system
  await page
    .getByRole('button', { name: /Alarmausgang Wasser/ })
    .first()
    .click();
  await expect.poll(last).toMatchObject({ attribute: 'STATE', value: true });
});

test('zeigt Abstand, Durchgang, Füllstand und Zählersensor', async ({ page }) => {
  await page.goto('/devices');

  // Distance with height (reference − distance) and reference height
  const distance = page.getByRole('group', { name: 'Zisterne Abstand' });
  await expect(distance).toContainText(/0[.,]8\s*m/);
  await expect(distance).toContainText(/1[.,]2 m/);
  await expect(distance).toContainText(/2[.,]0 m/);

  // Both directions of the HmIP-SPDR in one tile
  const passage = page.getByRole('group', { name: 'Durchgang Flur', exact: true });
  await expect(passage.getByRole('status')).toHaveText(/(Unbekannt|Unknown)/);
  await expect(passage).toContainText(/(Rechts nach links|Right to left)/);
  await expect(passage).toContainText('12');
  await expect(passage).toContainText('9');
  await expect(page.getByRole('group', { name: 'Durchgang Flur links nach rechts' })).toHaveCount(0);

  // Level and the volume of the vertical barrel set up in MASTER
  const tank = page.getByRole('group', { name: 'Heizöltank' });
  await expect(tank).toContainText('40');
  await expect(tank).toContainText('314 l');

  // IEC sensor: its power and counter
  const meter = page.getByRole('group', { name: 'Stromzähler Hausanschluss' });
  await expect(meter).toContainText(/512[.,]30/);
  await expect(meter).toContainText(/18[.,]?342[.,]50 kWh/);
});

test('beschreibt die Displays von HmIP-WRCD und HM-RC-19', async ({ page }) => {
  await page.goto('/devices');
  const last = async () => (await sentSetDatapoints(page)).at(-1);

  // The WGD's tiles are hidden, as in the WebUI
  await expect(page.getByRole('group', { name: 'Wandtafel Kachel 1' })).toHaveCount(0);

  // WRCD: line 1 with text and an icon, a sound, as one COMBINED_PARAMETER
  await page
    .getByRole('group', { name: 'Display Flur' })
    .getByRole('button', { name: /Display einrichten|Configure display/ })
    .click();
  await page.getByLabel(/^(Text): (Zeile|Line) 1$/).fill('Hallo Küche');
  await page.getByLabel(/^(Symbol|Icon): (Zeile|Line) 1$/).selectOption('10');
  await expect(page.getByRole('img', { name: /Vorschau|Preview/ })).toContainText('Hallo Küche');
  await page.getByLabel(/^(Akustisches Signal|Acoustic signal)$/).selectOption('6');
  await page.getByRole('button', { name: /^(Senden|Send)$/ }).click();
  await expect.poll(last).toMatchObject({
    attribute: 'COMBINED_PARAMETER',
    value: '{DDBC=WHITE,DDTC=BLACK,DDI=10,DDA=CENTER,DDS=Hallo K³che,DDID=1,DDC=true},{R=0,IN=5,ANS=6}',
  });

  // HM-RC-19: text, a symbol, then SUBMIT
  const remote = page.getByRole('group', { name: 'Fernbedienung Display' });
  await remote.getByLabel(/^(Text): Fernbedienung Display$/).fill('21.5');
  await remote.getByRole('button', { name: /Glocke|Bell/ }).click();
  await remote.getByRole('button', { name: /^(Senden|Send)$/ }).click();
  await expect
    .poll(async () => (await sentSetDatapoints(page)).slice(-3))
    .toMatchObject([
      { attribute: 'BACKLIGHT', value: 0 },
      { attribute: 'BELL', value: true },
      { attribute: 'SUBMIT', value: true },
    ]);
  expect((await sentSetDatapoints(page)).find((s) => s.attribute === 'TEXT')).toMatchObject({ value: '21.5' });
});

test('zeigt Sensoren mit eigenen Kacheln', async ({ page }) => {
  await page.goto('/devices');
  const emit = (channel: string, datapoint: string, value: unknown) =>
    page.evaluate(
      (e) => (window as Window & { __wsMock?: { emitEvent: (e: unknown) => void } }).__wsMock?.emitEvent(e),
      { channel, datapoint, value },
    );

  const rain = page.getByRole('group', { name: 'Regensensor' });
  await expect(rain.getByRole('status')).toHaveText(/^(Trocken|Dry)$/);
  await emit('00199D89A1B2C3:1', 'RAINING', true);
  await expect(rain.getByRole('status')).toHaveText(/Es regnet|Raining/);

  await expect(page.getByRole('group', { name: 'Lichtsensor Terrasse' })).toContainText(/5[.,]320/);
  const co2 = page.getByRole('group', { name: 'CO₂ Arbeitszimmer' });
  await expect(co2.getByRole('status')).toHaveText(/Gute Luft|Good air/);
  await emit('00199D89A1B2C5:1', 'CONCENTRATION', 1450);
  await expect(co2.getByRole('status')).toHaveText(/Lüften empfohlen|Time to air the room/);

  await expect(page.getByRole('group', { name: 'Feinstaub Wohnzimmer' }).getByRole('status')).toHaveText(
    /^(Gut|Good)$/,
  );
  await expect(page.getByRole('group', { name: 'Beet Bodenfeuchte' }).getByRole('status')).toHaveText(
    /^(Trocken|Dry)$/,
  );

  // Tilt sensor set up for vibration (CHANNEL_OPERATION_MODE 1)
  const tilt = page.getByRole('group', { name: 'Neigungssensor Garage' });
  await expect(tilt.getByRole('status')).toHaveText(/(Erschütterung|Vibration): (Nein|No)/);
  await emit('00199D89A1B2C8:1', 'MOTION', true);
  await expect(tilt.getByRole('status')).toHaveText(/(Erschütterung|Vibration): (Ja|Yes)/);

  const power = page.getByRole('group', { name: 'Netzausfall Keller' });
  await expect(power.getByRole('status')).toHaveText(/Netzspannung vorhanden|Mains power present/);
  await emit('00199D89A1B2C9:1', 'POWER_MAINS_FAILURE', true);
  await expect(power.getByRole('status')).toHaveText(/Stromausfall|Power failure/);
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
  await expect
    .poll(async () => (await sentSetDatapoints(page)).at(-1))
    .toMatchObject({ attribute: 'SMOKE_DETECTOR_COMMAND', value: 3 });
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
  await expect
    .poll(async () => (await sentSetDatapoints(page)).at(-1))
    .toMatchObject({ attribute: 'MOTION_DETECTION_ACTIVE', value: false });

  // Garage door: closing is a tap (command 3, as in the WebUI)
  const garage = page.getByRole('group', { name: 'Garagentor' });
  await expect(garage.getByRole('status')).toHaveText(/Geschlossen|Closed/);
  await garage.getByRole('button', { name: /^(Lüften|Ventilate)$/ }).click();
  await expect
    .poll(async () => (await sentSetDatapoints(page)).at(-1))
    .toMatchObject({ attribute: 'DOOR_COMMAND', value: 4 });
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
  await expect
    .poll(async () => (await sentSetDatapoints(page)).at(-1))
    .toMatchObject({ attribute: 'STATE', value: false });

  // Bus voltages of the wired access point
  await expect(page.getByRole('group', { name: 'HmIPW-DRAP' })).toContainText(/24[.,]4 V/);
});

test('bedient BidCos-Thermostat, Lamellen und zeigt die Sirene', async ({ page }) => {
  await page.goto('/devices');

  // HM-CC-RT-DN: set point SET_TEMPERATURE, manual mode via MANU_MODE
  const radiator = page.getByRole('group', { name: 'Heizkörper Gästezimmer' });
  await expect(radiator).toContainText(/(Ventil|Valve) 34 %/);
  await radiator.getByRole('button', { name: /(Temperatur erhöhen|Increase temperature)/i }).click();
  await expect
    .poll(async () => (await sentSetDatapoints(page)).at(-1))
    .toMatchObject({ attribute: 'SET_TEMPERATURE', value: 21.5 });
  await radiator.getByRole('button', { name: /^(Automatisch|Automatic)$/ }).click();
  await expect.poll(async () => (await sentSetDatapoints(page)).at(-1)?.attribute).toBe('MANU_MODE');

  // Venetian blind: slats behind their chip
  await page.getByText(/(Lamellen|Slats) · 50 %/).click();
  const slats = page.getByRole('slider', { name: /(Lamellen|Slats) Raffstore Büro/ });
  await slats.press('ArrowRight');
  await expect
    .poll(async () => (await sentSetDatapoints(page)).at(-1))
    .toMatchObject({ attribute: 'LEVEL_2', value: 0.55 });
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
  await page
    .getByRole('dialog', { name: /Urlaub/ })
    .getByRole('button', { name: /^(Löschen|Delete)$/ })
    .click();
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
    (window as Window & { __wsMock?: { setSysvar: (id: number, value: unknown) => void } }).__wsMock?.setSysvar(
      950,
      false,
    ),
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
  await page
    .getByRole('radiogroup', { name: /^(Startseite|Start page)$/ })
    .getByRole('radio', { name: /^(Favoriten|Favorites)$/ })
    .click();
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

  // Only the grip starts a drag
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 30, { steps: 10 });
  await page.mouse.up();
  expect((await first.boundingBox())!.x).toBe(box.x);

  // Drag the first tile to the right by a few columns
  const grip = (await first.locator('.tile-drag-handle').boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 30, { steps: 10 });
  await page.mouse.move(box.x + 420, box.y + 30, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => (await page.locator(`[data-tile-key="${key}"]`).boundingBox())!.x)
    .toBeGreaterThan(box.x + 100);
  // Once moved, the automatic arrangement is offered before anything is saved
  await expect(page.getByRole('button', { name: /^(Automatisch anordnen|Arrange automatically)$/ })).toBeVisible();

  await page.getByRole('button', { name: /^(Fertig|Done)$/ }).click();
  const stored = await page.evaluate(() =>
    (
      (
        window as Window & { __wsMock?: { sentMessages: () => Array<{ type: string; id?: number; layout?: string }> } }
      ).__wsMock?.sentMessages() ?? []
    ).filter((m) => m.type === 'setLayout'),
  );
  expect(stored).toHaveLength(1);
  expect(stored[0].id).toBe(1);
  const layout = JSON.parse(stored[0].layout!);
  expect(layout.v).toBe(3);
  expect(
    Object.values(layout.sections as Record<string, { lg?: { i: string; x: number }[] }>).some((section) =>
      section.lg?.some((t) => t.i === key && t.x > 0),
    ),
  ).toBe(true);

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
        {
          id: 958,
          name: 'Wasseralarm',
          active: true,
          counter: 1,
          firstTime: '2026-01-15 09:12:00',
          lastTime: '2026-01-15 09:12:00',
          channel: 'Wassermelder Keller',
          roomName: 'Keller',
          message: 'Wasser erkannt',
        },
        {
          id: 954,
          name: 'Alarmzone 1',
          active: false,
          counter: 2,
          firstTime: '2026-01-14 22:00:00',
          lastTime: '2026-01-14 22:05:00',
          message: 'nicht ausgelöst',
        },
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
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          (
            window as Window & { __wsMock?: { sentMessages: () => Array<{ type: string; id?: number }> } }
          ).__wsMock?.sentMessages() ?? []
        )
          .filter((m) => m.type === 'acknowledgeAlarmMessage')
          .map((m) => m.id),
      ),
    )
    .toEqual([958]);

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

  // Rendered from the paramset description (the power threshold of a
  // metering plug HM-ES-PMSw1)
  const datapoints = page.getByLabel('Leistungsschwelle Waschmaschine');
  await expect(datapoints).toBeVisible();
  await expect(datapoints.getByText('DECISION_VALUE', { exact: true })).toBeVisible();
  await expect(datapoints.getByText(/^(No|Nein)$/)).toBeVisible();

  await page.evaluate(() => {
    (window as Window & { __wsMock?: { emitEvent: (e: unknown) => void } }).__wsMock?.emitEvent({
      channel: 'LEQ0000020:3',
      datapoint: 'DECISION_VALUE',
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
        const mock = (
          window as Window & {
            __wsMock?: { sentMessages: () => Array<{ type: string; all?: boolean }> };
          }
        ).__wsMock;
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

test('zeigt die Geräte-Gesundheit nach Dringlichkeit', async ({ page }) => {
  await page.goto('/room/1');
  await page.getByRole('button', { name: /^(Menu|Menü)$/ }).click();
  await page.getByRole('button', { name: /^(Device health|Geräte-Gesundheit)$/ }).click();
  await expect(page).toHaveURL(/\/health$/);

  const summary = page.getByRole('list', { name: 'Summary' });
  await expect(summary.getByRole('listitem', { name: 'Unreachable: 1' })).toBeVisible();
  await expect(summary.getByRole('listitem', { name: 'Battery empty: 1' })).toBeVisible();
  await expect(summary.getByRole('listitem', { name: 'Battery low soon: 2' })).toBeVisible();
  await expect(summary.getByRole('listitem', { name: 'Poor signal: 2' })).toBeVisible();

  // Devices needing attention, the unreachable one first
  const devices = page.getByRole('list', { name: 'Devices' });
  await expect(devices.getByRole('listitem')).toHaveCount(3);
  await expect(devices.getByRole('listitem').first()).toHaveAccessibleName('Wandthermostat Flur');
  await expect(
    devices.getByRole('listitem', { name: 'Fensterkontakt Bad' }).getByLabel('Battery: Battery empty, 1.00 V'),
  ).toBeVisible();
  await expect(devices.getByText('Configuration pending')).toBeVisible();

  await page.getByRole('button', { name: 'All (5)' }).click();
  await expect(devices.getByRole('listitem')).toHaveCount(5);
  await expect(
    devices.getByRole('listitem', { name: 'Taster Esszimmer' }).getByText('Last seen 2 days ago'),
  ).toBeVisible();
});

test('zeigt Benachrichtigungsregeln und schaltet sie aus', async ({ page }) => {
  await page.goto('/room/1');
  await page.getByRole('button', { name: /^(Menu|Menü)$/ }).click();
  await page.getByRole('button', { name: 'Manage rules' }).click();
  await expect(page).toHaveURL(/\/rules$/);

  const rules = page.getByRole('list', { name: 'Notification rules' });
  const windowRule = rules.getByRole('listitem', { name: 'Fenster Bad lange offen' });
  // Without an own text the summary the editor wrote
  await expect(windowRule).toContainText('Fensterkontakt Bad: Zustand ist nicht geschlossen');
  await expect(windowRule).toContainText('for 15 minutes');
  await expect(rules.getByRole('listitem', { name: 'Haustür nachts geöffnet' })).toContainText('22:00–06:00');

  await windowRule.getByRole('switch', { name: 'Rule "Fenster Bad lange offen" active' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const mock = (
          window as Window & {
            __wsMock?: { sentMessages: () => Array<{ type: string; rule?: { enabled: boolean } }> };
          }
        ).__wsMock;
        return mock?.sentMessages().find((m) => m.type === 'saveRule')?.rule?.enabled;
      }),
    )
    .toBe(false);
  await expect(windowRule).toContainText('Off');
});

test('verschiebt beim Anordnen ganze Bereiche, die Kacheln bleiben in ihrem Bereich', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/room/1');
  const headings = page.getByRole('main').getByRole('heading', { level: 2 });
  await expect(headings.nth(1)).toBeVisible();
  const [first, second] = [await headings.nth(0).textContent(), await headings.nth(1).textContent()];

  await page.getByRole('button', { name: /^(Anordnen|Arrange)$/ }).click();
  // The sections stay while arranging, each with its own grid
  await expect(headings.nth(0)).toHaveText(first!);
  await expect(page.getByRole('button', { name: `Move "${first}" up` })).toBeDisabled();
  await page.getByRole('button', { name: `Move "${first}" down` }).click();
  await expect(headings.nth(0)).toHaveText(second!);
  await page.getByRole('button', { name: /^(Fertig|Done)$/ }).click();

  const stored = await page.evaluate(() =>
    (
      (
        window as Window & { __wsMock?: { sentMessages: () => Array<{ type: string; layout?: string }> } }
      ).__wsMock?.sentMessages() ?? []
    )
      .filter((m) => m.type === 'setLayout')
      .map((m) => JSON.parse(m.layout!)),
  );
  expect(stored).toHaveLength(1);
  expect(stored[0].order.length).toBeGreaterThan(1);

  // Kept after a reload, still with headings
  await page.reload();
  await expect(headings.nth(0)).toHaveText(second!);
  await expect(headings.nth(1)).toHaveText(first!);
});

test('bietet das Anordnen auf dem Handy im Menü an', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/room/1');
  await expect(page.getByRole('main').getByRole('heading', { level: 2 }).first()).toBeVisible();
  // The header has no room for it on phones
  await expect(page.getByRole('button', { name: /^(Anordnen|Arrange)$/ })).toHaveCount(0);
  await page.getByRole('button', { name: /^(Menü|Menu)$/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^(Anordnen|Arrange)$/ })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Fertig|Done)$/ })).toBeVisible();
});

test('bedient die Farb- und Weißkanäle der BidCos-LED-Controller', async ({ page }) => {
  await page.goto('/devices');
  // Color 132 of 0..199 is a hue of 239° (rgbw.fn)
  await expect(page.getByText('Color 239°')).toBeVisible();
  await page.getByRole('button', { name: 'White', exact: true }).click();
  await page.getByRole('combobox', { name: 'Program LED-Band Terrasse Programm' }).selectOption('4');
  await expect(page.getByText('Color value 30 %')).toBeVisible();

  await expect
    .poll(async () => (await sentSetDatapoints(page)).map((m) => [m.attribute, m.value]))
    .toEqual(
      expect.arrayContaining([
        ['COLOR', 200],
        ['PROGRAM', 4],
      ]),
    );
});

test('spielt Töne auf MP3-Gong und Funkgong', async ({ page }) => {
  await page.goto('/devices');
  const section = page.getByRole('region', { name: /Chimes & signals/ });
  // The status channel of the MP3 player only repeats the receiver
  await expect(section.getByText('MP3-Gong Flur Status')).toHaveCount(0);
  await section.getByRole('combobox', { name: 'Sound MP3-Gong Flur' }).selectOption('3');
  await section.getByRole('button', { name: 'Play' }).click();
  await section.getByRole('button', { name: 'Ring' }).click();

  await expect
    .poll(async () => (await sentSetDatapoints(page)).map((m) => [m.attribute, m.value]))
    .toEqual(
      expect.arrayContaining([
        ['SOUNDFILE', 3],
        ['LEVEL', 1],
        ['STATE', true],
      ]),
    );
});
