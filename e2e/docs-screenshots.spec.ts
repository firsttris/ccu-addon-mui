import { Browser, expect, Page, test } from '@playwright/test';
import { installWebSocketMock } from './helpers/websocketMock';

// The pictures of the documentation (docs/screenshot-*.png) that show the
// dashboard, with the mock's demo home at a fixed time. Not a test:
// `bun run docs:screenshots` takes them anew; the setup pages come from
// e2e-stack/docs-screenshots.spec.ts against the fake CCU.
test.skip(!process.env.DOCS, 'documentation screenshots are taken with bun run docs:screenshots');

test.use({ locale: 'de-DE', timezoneId: 'Europe/Berlin' });

type Options = { width: number; height: number; dark: boolean; login?: boolean };

const open = async (browser: Browser, { width, height, dark, login }: Options, scale = 1) => {
  const context = await browser.newContext({
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    viewport: { width, height },
    deviceScaleFactor: scale,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-01-15T10:00:00+01:00') });
  await installWebSocketMock(page, { requireLogin: login });
  await page.addInitScript((dark) => localStorage.setItem('theme-dark', JSON.stringify(dark)), dark);
  return page;
};

// Ready, the fonts loaded and the tiles' late values arrived
const settle = async (page: Page, ready: string) => {
  await expect(page.getByText(ready).first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
};

// A section of "All devices" at the top of the screen, below the header
const scrollTo = async (page: Page, heading: string) => {
  await page
    .getByRole('heading', { name: new RegExp(`^${heading}`) })
    .first()
    .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 76));
  await page.waitForTimeout(300);
};

const save = (page: Page, name: string) =>
  page.screenshot({ path: `docs/screenshot-${name}.png`, animations: 'disabled' });

const tablet = { width: 1180, height: 820, dark: true };
const phone = { width: 390, height: 844, dark: true };

test('tablet', async ({ browser }) => {
  const page = await open(browser, tablet);
  await page.goto('/devices');
  await settle(page, 'Rauchmelder Flur');
  await save(page, 'tablet');
});

for (const [name, heading] of [
  ['handy-licht', 'Licht & Schalter'],
  ['handy-rollladen', 'Rollläden'],
  ['handy-tuer', 'Türen'],
  ['handy-sicherheit', 'Sicherheit'],
] as const) {
  test(name, async ({ browser }) => {
    const page = await open(browser, phone);
    await page.goto('/devices');
    await settle(page, 'Rauchmelder Flur');
    await scrollTo(page, heading);
    await save(page, name);
  });
}

test('gesundheit', async ({ browser }) => {
  const page = await open(browser, { width: 1024, height: 768, dark: false });
  await page.goto('/health');
  await settle(page, 'Fensterkontakt Bad');
  await save(page, 'gesundheit');
});

test('regeln', async ({ browser }) => {
  const page = await open(browser, { width: 1024, height: 768, dark: false });
  await page.goto('/rules');
  await settle(page, 'Haustür nachts geöffnet');
  await save(page, 'regeln');
});

test('login', async ({ browser }) => {
  const page = await open(browser, { ...tablet, login: true });
  await page.goto('/');
  await expect(page.getByLabel(/Passwort/)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await save(page, 'login');
});

// The tablet with all devices and two phones with rooms, on a dark grid
test('hero', async ({ browser }) => {
  const shot = async (options: Options, path: string, ready: string) => {
    const page = await open(browser, options, 2);
    await page.goto(path);
    await settle(page, ready);
    return (await page.screenshot({ animations: 'disabled' })).toString('base64');
  };
  const devices = await shot(tablet, '/devices', 'Rauchmelder Flur');
  const living = await shot({ ...phone, height: 800 }, '/room/1', 'Fenstergriff Wohnzimmer');
  const boiler = await shot({ ...phone, height: 800 }, '/room/3', 'Haustür');

  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  const frame = 'position:absolute;background:#1a1c1e;box-shadow:0 30px 80px rgba(0,0,0,.7),inset 0 0 0 2px #2a2d30';
  await page.setContent(`<body style="margin:0;width:1800px;height:1000px;overflow:hidden;position:relative;
    background-color:#0b0d0e;
    background-image:radial-gradient(900px 500px at 85% 100%, rgba(120,60,200,.28), transparent 70%),
      linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
    background-size:auto, 40px 40px, 40px 40px">
    <div style="${frame};left:70px;top:70px;padding:22px;border-radius:44px">
      <img src="data:image/png;base64,${devices}" style="width:1180px;height:820px;border-radius:24px;display:block"></div>
    <div style="${frame};left:1130px;top:200px;padding:14px;border-radius:52px">
      <img src="data:image/png;base64,${living}" style="width:338px;height:693px;border-radius:40px;display:block"></div>
    <div style="${frame};left:1420px;top:110px;padding:14px;border-radius:52px">
      <img src="data:image/png;base64,${boiler}" style="width:338px;height:693px;border-radius:40px;display:block"></div>
  </body>`);
  await save(page, 'hero');
});
