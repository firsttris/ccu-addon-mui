import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, Page, test } from '@playwright/test';
import { installWebSocketMock } from './helpers/websocketMock';

// The moving pictures of the tiles in docs/geraete.md (docs/kacheln/*.webp):
// each tile of the mock's demo home in a short scene, as the CCU reports
// changes (a window tilts and opens, the smoke detector sounds), taken frame
// by frame and joined by ffmpeg (libwebp) into an animated WebP. Not a test:
// `npm run docs:tiles` takes them anew (the "Update screenshots" workflow
// with "tiles"). Kept apart from docs:screenshots: an animation never comes
// out twice the same, so every run would change all pictures.
test.skip(!process.env.DOCS, 'tile pictures are taken with npm run docs:tiles');

test.use({ locale: 'de-DE', timezoneId: 'Europe/Berlin', serviceWorkers: 'block' });
test.setTimeout(10 * 60 * 1000);

const OUT = 'docs/kacheln';
const SCALE = 2;
const FPS = 15;

// A change the CCU reports, after ms from the start of the scene
type Step = { at: number; channel: string; datapoint: string; value: unknown };
// tile: the name on the tile (exact, unless partial); setup: the state
// before the scene starts
type Scene = { file: string; tile: string; partial?: boolean; ms?: number; setup?: Step[]; steps?: Step[] };

const at = (ms: number, channel: string, datapoint: string, value: unknown): Step => ({ at: ms, channel, datapoint, value });

// One scene per tile of the table in docs/geraete.md, in its order
const scenes: Scene[] = [
  {
    file: 'thermostat',
    tile: 'Wohnzimmer Thermostat',
    steps: [
      at(500, 'BidCos-RF.LEQ0000004:1', 'SET_POINT_TEMPERATURE', 23.5),
      at(1800, 'BidCos-RF.LEQ0000004:1', 'WINDOW_STATE', 1),
      at(3000, 'BidCos-RF.LEQ0000004:1', 'WINDOW_STATE', 0),
      at(3200, 'BidCos-RF.LEQ0000004:1', 'SET_POINT_TEMPERATURE', 21),
    ],
  },
  {
    file: 'fussbodenheizung',
    tile: 'Fußbodenheizung Bad',
    steps: [at(400, '00201D8994A2B1:1', 'LEVEL', 0.15), at(1800, '00201D8994A2B1:1', 'LEVEL', 1), at(3200, '00201D8994A2B1:1', 'LEVEL', 0.62)],
  },
  {
    file: 'schalter',
    tile: 'Wohnzimmer Licht',
    steps: [at(500, 'BidCos-RF.LEQ0000001:1', 'STATE', true), at(2400, 'BidCos-RF.LEQ0000001:1', 'STATE', false)],
  },
  {
    file: 'dimmer',
    tile: 'Esstisch',
    steps: [at(400, '0001D3C99C1A2B:4', 'LEVEL', 0.15), at(1500, '0001D3C99C1A2B:4', 'LEVEL', 1), at(2700, '0001D3C99C1A2B:4', 'LEVEL', 0.6)],
  },
  {
    file: 'farblicht',
    tile: 'LED-Streifen',
    steps: [at(400, '0001E0A99B2C3D:2', 'HUE', 20), at(1500, '0001E0A99B2C3D:2', 'HUE', 160), at(2700, '0001E0A99B2C3D:2', 'HUE', 275)],
  },
  {
    file: 'rollladen',
    tile: 'Raffstore Büro',
    steps: [at(400, '0045D8A9A2B3C4:4', 'LEVEL', 0.15), at(1800, '0045D8A9A2B3C4:4', 'LEVEL_2', 1), at(2600, '0045D8A9A2B3C4:4', 'LEVEL', 0.7), at(3000, '0045D8A9A2B3C4:4', 'LEVEL_2', 0.5)],
  },
  {
    file: 'fenster',
    tile: 'Fenstergriff Wohnzimmer',
    steps: [at(300, '0000DBE9A5C1F2:1', 'STATE', 0), at(1400, '0000DBE9A5C1F2:1', 'STATE', 1), at(2600, '0000DBE9A5C1F2:1', 'STATE', 2)],
  },
  {
    file: 'fensterantrieb',
    tile: 'Oberlicht Treppenhaus',
    steps: [at(400, '00299D89A1B2C2:1', 'LEVEL', 0.5), at(1500, '00299D89A1B2C2:1', 'LEVEL', 1), at(3200, '00299D89A1B2C2:1', 'LEVEL', 0)],
  },
  {
    file: 'tuerschloss',
    tile: 'Kellertür',
    steps: [at(500, '002A1BE9A3C4D5:1', 'LOCK_STATE', 1), at(2200, '002A1BE9A3C4D5:1', 'LOCK_STATE', 2)],
  },
  {
    file: 'garagentor',
    tile: 'Garagentor',
    steps: [at(400, '0019DA49A6B7C8:1', 'DOOR_STATE', 1), at(2400, '0019DA49A6B7C8:1', 'DOOR_STATE', 0)],
  },
  {
    file: 'rauchmelder',
    tile: 'Rauchmelder Flur',
    steps: [at(600, '000A1B2C3D4E5F:1', 'SMOKE_DETECTOR_ALARM_STATUS', 1), at(3000, '000A1B2C3D4E5F:1', 'SMOKE_DETECTOR_ALARM_STATUS', 0)],
  },
  {
    file: 'bewegung',
    tile: 'Bewegungsmelder Eingang',
    steps: [at(300, '000BBD89A1C2D3:1', 'MOTION', false), at(1300, '000BBD89A1C2D3:1', 'MOTION', true)],
  },
  {
    file: 'wassermelder',
    tile: 'Wassermelder Heizung',
    steps: [
      at(600, '00319BE9A8B9C1:1', 'WATERLEVEL_DETECTED', true),
      at(600, '00319BE9A8B9C1:1', 'ALARMSTATE', true),
      at(3000, '00319BE9A8B9C1:1', 'WATERLEVEL_DETECTED', false),
      at(3000, '00319BE9A8B9C1:1', 'ALARMSTATE', false),
    ],
  },
  {
    file: 'sirene',
    tile: 'Sirene Flur',
    steps: [
      at(500, '0039E0A9A4B5C6:3', 'ACOUSTIC_ALARM_ACTIVE', true),
      at(500, '0039E0A9A4B5C6:3', 'OPTICAL_ALARM_ACTIVE', true),
      at(3000, '0039E0A9A4B5C6:3', 'ACOUSTIC_ALARM_ACTIVE', false),
      at(3000, '0039E0A9A4B5C6:3', 'OPTICAL_ALARM_ACTIVE', false),
    ],
  },
  { file: 'gong', tile: 'MP3-Gong Flur', steps: [at(500, '00185D89A1B2C9:2', 'LEVEL', 0.6), at(2500, '00185D89A1B2C9:2', 'LEVEL', 0)] },
  { file: 'zutritt', tile: 'Zutritt', steps: [at(600, '002BE0C98ECD57:1', 'ACCESS_AUTHORIZATION', 1)] },
  {
    file: 'klima',
    tile: 'Küche Klima',
    steps: [at(500, '000E1BE9A4C5D6:1', 'ACTUAL_TEMPERATURE', 22.6), at(1500, '000E1BE9A4C5D6:1', 'HUMIDITY', 64), at(2700, '000E1BE9A4C5D6:1', 'ACTUAL_TEMPERATURE', 21.4)],
  },
  {
    file: 'regen',
    tile: 'Regensensor',
    steps: [at(500, '00199D89A1B2C3:1', 'RAINING', true), at(1200, '00199D89A1B2C3:1', 'HEATER_STATE', true), at(3000, '00199D89A1B2C3:1', 'RAINING', false)],
  },
  {
    file: 'helligkeit',
    tile: 'Lichtsensor Terrasse',
    steps: [at(500, '00199D89A1B2C4:1', 'CURRENT_ILLUMINATION', 9000), at(2000, '00199D89A1B2C4:1', 'CURRENT_ILLUMINATION', 800)],
  },
  {
    file: 'co2',
    tile: 'CO₂ Arbeitszimmer',
    steps: [at(400, '00199D89A1B2C5:1', 'CONCENTRATION', 1150), at(1400, '00199D89A1B2C5:1', 'CONCENTRATION', 1800), at(2800, '00199D89A1B2C5:1', 'CONCENTRATION', 820)],
  },
  {
    file: 'feinstaub',
    tile: 'Feinstaub Wohnzimmer',
    steps: [at(500, '00199D89A1B2C6:1', 'MASS_CONCENTRATION_PM_2_5', 28), at(2200, '00199D89A1B2C6:1', 'MASS_CONCENTRATION_PM_2_5', 7.4)],
  },
  {
    file: 'bodenfeuchte',
    tile: 'Beet Bodenfeuchte',
    steps: [at(500, '00199D89A1B2C7:1', 'SOIL_MOISTURE', 48), at(2400, '00199D89A1B2C7:1', 'SOIL_MOISTURE', 22)],
  },
  {
    file: 'erschuetterung',
    tile: 'Neigungssensor Garage',
    steps: [at(500, '00199D89A1B2C8:1', 'MOTION', true), at(2600, '00199D89A1B2C8:1', 'MOTION', false)],
  },
  {
    file: 'netzausfall',
    tile: 'Netzausfall Keller',
    steps: [at(500, '00199D89A1B2C9:1', 'POWER_MAINS_FAILURE', true), at(2600, '00199D89A1B2C9:1', 'POWER_MAINS_FAILURE', false)],
  },
  {
    file: 'bewaesserung',
    tile: 'Bewässerung Beet',
    steps: [at(500, '00299D89A1B2C1:3', 'STATE', true), at(2800, '00299D89A1B2C1:3', 'STATE', false)],
  },
  {
    file: 'wasserschutz',
    tile: 'Wasserschutz Hauptleitung',
    steps: [at(600, '0047D8A9A5B6C7:3', 'LEVEL', 0), at(2400, '0047D8A9A5B6C7:3', 'LEVEL', 1)],
  },
  {
    file: 'taster',
    tile: 'Wandtaster Wohnzimmer',
    partial: true,
    steps: [at(500, '0001D8A9A1B2C3:1', 'PRESS_SHORT', true), at(1800, '0001D8A9A1B2C3:2', 'PRESS_LONG', true)],
  },
  {
    file: 'eingang',
    tile: 'Klingeltaster',
    steps: [at(500, '0019A0C9B3E2D2:1', 'PRESS_SHORT', true), at(2000, '0019A0C9B3E2D2:1', 'PRESS_SHORT', true)],
  },
  {
    file: 'energiezaehler',
    tile: 'Stromzähler',
    // Faster the more power, backwards while feeding in
    steps: [at(300, '003FA2698BC439:1', 'POWER', 2400), at(2000, '003FA2698BC439:1', 'POWER', -800), at(3400, '003FA2698BC439:1', 'POWER', 87)],
    ms: 4600,
  },
  {
    file: 'gaszaehler',
    tile: 'Stromzähler',
    // The same HmIP-ESI with a gas meter instead
    setup: [
      at(0, '003FA2698BC439:1', 'POWER', 0),
      at(0, '003FA2698BC439:2', 'ENERGY_COUNTER', 0),
      at(0, '003FA2698BC439:4', 'ENERGY_COUNTER', 0),
      at(0, '003FA2698BC439:2', 'GAS_VOLUME', 4821.37),
      at(0, '003FA2698BC439:1', 'GAS_FLOW', 0.4),
    ],
    steps: [at(800, '003FA2698BC439:1', 'GAS_FLOW', 2.6), at(2800, '003FA2698BC439:1', 'GAS_FLOW', 0.4)],
    ms: 4200,
  },
  { file: 'accesspoint', tile: 'HmIPW-DRAP', steps: [at(800, '00179A4989A48D:1', 'VOLTAGE', 23.9), at(2000, '00179A4989A48D:1', 'VOLTAGE', 24.4)] },
  { file: 'generisch', tile: 'Leistungsschwelle Waschmaschine', ms: 2000 },
];

const emit = (page: Page, step: Step) =>
  page.evaluate(
    (event) => (window as unknown as { __wsMock: { emitEvent: (e: unknown) => void } }).__wsMock.emitEvent(event),
    { channel: step.channel, datapoint: step.datapoint, value: step.value },
  );

// The width of a JPEG, from its frame header (SOF0/SOF2)
const jpegWidth = (jpeg: Buffer) => {
  for (let i = 2; i < jpeg.length; ) {
    const marker = jpeg[i + 1];
    if (marker === 0xc0 || marker === 0xc2) return jpeg.readUInt16BE(i + 7);
    i += 2 + jpeg.readUInt16BE(i + 2);
  }
  throw new Error('no JPEG frame header');
};

// Room below the tile for a tile that grows during its scene
const GROW = 200 * SCALE;

const record = async (page: Page, scene: Scene) => {
  for (const step of scene.setup ?? []) await emit(page, step);
  // The tile itself, not a tile of another channel that merely mentions its name
  const tile = page
    .locator('[data-slot="tile"]')
    .filter({ has: page.getByText(scene.tile, { exact: !scene.partial }) })
    .first();
  await expect(tile, scene.tile).toBeVisible();
  // Alone on the page (nothing else visible, not even the header), near the
  // top: a tile that changes its size shows no neighbor, and has room to grow
  await tile.evaluate((el) => {
    el.setAttribute('data-docs-tile', '');
    window.scrollBy(0, el.getBoundingClientRect().top - 40);
  });
  await page.addStyleTag({
    // Its own height, not the one of its grid row
    content:
      'body { visibility: hidden !important; } [data-docs-tile] { visibility: visible !important; align-self: start !important; height: auto !important; }',
  });
  await page.waitForTimeout(scene.setup ? 900 : 400);
  const box = await tile.boundingBox();
  if (!box) throw new Error(`no box for ${scene.tile}`);
  // A little room for glows and shadows around the tile
  const pad = 6 * SCALE;
  const clip = { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad + GROW };
  let bottom = box.y + box.height;

  // Chromium's screencast: every frame it paints, with its time
  const dir = mkdtempSync(join(tmpdir(), `tile-${scene.file}-`));
  const frames: { file: string; time: number }[] = [];
  // The screencast paints the viewport in its own size: the factor from CSS pixels
  let scale = SCALE;
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
    const file = join(dir, `${String(frames.length).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, time: metadata.timestamp ?? Date.now() / 1000 });
    const buffer = Buffer.from(data, 'base64');
    if (frames.length === 1) scale = jpegWidth(buffer) / metadata.deviceWidth;
    void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
  });
  const viewport = page.viewportSize()!;
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    everyNthFrame: 1,
    maxWidth: viewport.width,
    maxHeight: viewport.height,
  });

  const steps = [...(scene.steps ?? [])].sort((a, b) => a.at - b.at);
  const duration = scene.ms ?? Math.max(3200, (steps.at(-1)?.at ?? 0) + 1400);
  const start = Date.now();
  while (Date.now() - start < duration) {
    while (steps.length > 0 && steps[0].at <= Date.now() - start) await emit(page, steps.shift()!);
    const now = await tile.boundingBox();
    if (now) bottom = Math.max(bottom, now.y + now.height);
    await page.waitForTimeout(40);
  }
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  await tile.evaluate((el) => el.removeAttribute('data-docs-tile'));
  await page.evaluate(() => document.querySelectorAll('style').forEach((style) => style.textContent?.includes('data-docs-tile') && style.remove()));
  if (frames.length === 0) throw new Error(`no frames for ${scene.tile}`);

  // Each frame as long as it was on screen (the last one until the end)
  const end = frames[0].time + duration / 1000;
  const list = frames
    .map((f, i) => `file '${f.file}'\nduration ${Math.max(0.001, (frames[i + 1]?.time ?? end) - f.time).toFixed(4)}`)
    .join('\n');
  writeFileSync(join(dir, 'frames.txt'), `${list}\nfile '${frames.at(-1)!.file}'\n`);

  // The tile, as high as it got (even sizes, as the WebP encoder wants them)
  const even = (n: number) => 2 * Math.floor(n / 2);
  const width = even(clip.width * scale);
  const height = even(Math.min(bottom - clip.y + pad, clip.height) * scale);
  mkdirSync(OUT, { recursive: true });
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    join(dir, 'frames.txt'),
    '-vf',
    `fps=${FPS},crop=${width}:${height}:${even(clip.x * scale)}:${even(clip.y * scale)}`,
    '-c:v',
    'libwebp_anim',
    '-loop',
    '0',
    // Below 100 the encoder leaves traces of what was there before where a
    // tile shrinks (still lossy, half the size of lossless)
    '-quality',
    '100',
    '-compression_level',
    '6',
    '-pix_fmt',
    'yuv420p',
    join(OUT, `${scene.file}.webp`),
  ]);
  rmSync(dir, { recursive: true, force: true });
};

test('kacheln', async ({ browser }) => {
  const context = await browser.newContext({
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    // Twice the size and zoomed: the screencast paints CSS pixels, so this
    // gives sharp pictures for screens with two pixels per point
    viewport: { width: 1180 * SCALE, height: 900 * SCALE },
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await installWebSocketMock(page);
  await page.addInitScript(() => localStorage.setItem('theme-dark', 'true'));
  await page.addInitScript((zoom) => {
    document.addEventListener('DOMContentLoaded', () => (document.documentElement.style.zoom = String(zoom)));
  }, SCALE);
  await page.goto('/devices');
  await expect(page.getByText('Rauchmelder Flur').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);

  const only = process.env.TILES?.split(',');
  for (const scene of scenes) {
    if (only && !only.includes(scene.file)) continue;
    await test.step(scene.file, () => record(page, scene));
  }
});
