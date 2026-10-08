// The app in a browser on a real openccu-lite (scripts/lite-vm-test.sh):
// logs in as openccu-lite's login page does, opens /addons/mui/ through
// lighttpd and occulited's session gate, as the shell's frame does with
// ?theme= and ?lang=, and checks that the app starts: the room the VM test
// made is listed, the theme and the language come from the frame's
// parameters, and nothing of the app failed on the way (console errors,
// uncaught exceptions, requests below /addons/mui/ that failed).
//
// Then screenshots into <out dir>/screenshots: the app inside openccu-lite's
// shell (/nav/mui, the page its menu entry opens), light and dark, on a
// desktop and a phone, and a few of the app's own pages. Errors of the
// shell itself are logged, not counted: they are openccu-lite's.
//
//   node scripts/lite-vm-browser.mjs <base> <user> <password> <room> <out dir>
//
// Takes the browser at MUI_VM_CHROMIUM when set, else the runner's Chrome
// (channel chrome), else Playwright's Chromium.
import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const [base, user, password, room, out] = process.argv.slice(2);
if (!out) {
  console.error('usage: lite-vm-browser.mjs <base> <user> <password> <room> <out dir>');
  process.exit(2);
}
const shots = path.join(out, 'screenshots');
fs.mkdirSync(shots, { recursive: true });

let browser;
if (process.env.MUI_VM_CHROMIUM) {
  browser = await chromium.launch({ executablePath: process.env.MUI_VM_CHROMIUM });
} else {
  try {
    browser = await chromium.launch({ channel: 'chrome' });
  } catch {
    browser = await chromium.launch();
  }
}
const problems = [];
const ours = (url) => (url ?? '').includes('/addons/mui/');

// A logged-in context: the login's cookies go to it, occulite_gate at
// /addons/ is the session the gate passes on
const session = async (options) => {
  const context = await browser.newContext(options);
  const login = await context.request.post(`${base}/api/auth/v1/login`, { data: { username: user, password } });
  if (!login.ok()) throw new Error(`login: HTTP ${login.status()}`);
  return context;
};

const watch = (page, name) => {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (ours(m.location()?.url) || ours(page.url())) problems.push(`${name}: console: ${m.text()}`);
    else console.log(`${name}: openccu-lite's console: ${m.text()}`);
  });
  page.on('pageerror', (e) => (ours(page.url()) ? problems.push(`${name}: exception: ${e.message}`) : console.log(`${name}: openccu-lite's exception: ${e.message}`)));
  page.on('requestfailed', (r) => ours(r.url()) && problems.push(`${name}: failed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => ours(r.url()) && r.status() >= 400 && problems.push(`${name}: HTTP ${r.status()}: ${r.url()}`));
};

// Waits for the room in the app's list of rooms
const roomShown = (scope) => scope.getByText(room).first().waitFor({ timeout: 60_000 });
// Waits for a page of the app, in the page itself or in the shell's frame
const appShown = (scope) => scope.getByRole('main').first().waitFor({ timeout: 60_000 });
const shot = async (page, file) => {
  // Fonts and the tiles' entrance settle
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shots, file) });
  console.log(`screenshot ${file}`);
};

try {
  // --- the app as the shell's frame opens it: the checks -------------------------------
  const desktop = await session({ viewport: { width: 1280, height: 800 }, locale: 'en-US' });
  const page = await desktop.newPage();
  watch(page, 'app');
  await page.goto(`${base}/addons/mui/rooms?theme=dark&lang=en`, { waitUntil: 'domcontentloaded' });
  await roomShown(page);
  const html = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, lang: document.documentElement.lang }));
  if (html.theme !== 'dark') problems.push(`theme from ?theme=dark: ${html.theme}`);
  if (html.lang !== 'en') problems.push(`language from ?lang=en: ${html.lang}`);
  console.log(`app started: room "${room}" listed, theme ${html.theme}, language ${html.lang}`);
  await shot(page, 'app.png');
  await desktop.close();

  // --- inside openccu-lite's shell, light and dark, desktop and phone -----------------------
  for (const [name, options] of [
    ['shell-desktop-light', { viewport: { width: 1440, height: 900 }, colorScheme: 'light' }],
    ['shell-desktop-dark', { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }],
    ['shell-phone-dark', { ...devices['iPhone 13'], defaultBrowserType: undefined, colorScheme: 'dark' }],
    ['shell-phone-light', { ...devices['iPhone 13'], defaultBrowserType: undefined, colorScheme: 'light' }],
  ]) {
    const context = await session({ ...options, locale: 'de-DE' });
    const shell = await context.newPage();
    watch(shell, name);
    await shell.goto(`${base}/nav/mui`, { waitUntil: 'domcontentloaded' });
    await appShown(shell.frameLocator('iframe[src*="/addons/mui/"]'));
    await shot(shell, `${name}.png`);
    await context.close();
  }

  // --- the app's own pages ------------------------------------------------------------------
  const pages = await session({ viewport: { width: 1280, height: 800 }, colorScheme: 'light', locale: 'de-DE' });
  const app = await pages.newPage();
  watch(app, 'pages');
  for (const [route, file] of [
    ['', 'app-room.png'],
    ['rooms', 'app-rooms.png'],
    ['setup', 'app-setup.png'],
    ['setup/heating-groups', 'app-heating-groups.png'],
    ['devices', 'app-devices.png'],
    ['setup/system', 'app-system.png'],
  ]) {
    await app.goto(`${base}/addons/mui/${route}?theme=light&lang=de`, { waitUntil: 'domcontentloaded' });
    await appShown(app);
    await shot(app, file);
  }
  await pages.close();
} catch (e) {
  problems.push(String(e?.message ?? e));
} finally {
  await browser.close();
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
