// The app in a browser on a real openccu-lite (scripts/lite-vm-test.sh):
// logs in as openccu-lite's login page does, opens /addons/mui/ through
// lighttpd and occulited's session gate, as the shell's frame does with
// ?theme= and ?lang=, and checks that the app starts: the room the VM test
// made is listed, the theme and the language come from the frame's
// parameters, and nothing failed on the way (console errors, uncaught
// exceptions, requests below /addons/mui/ that failed). Leaves a
// screenshot in the output directory.
//
//   node scripts/lite-vm-browser.mjs <base> <user> <password> <room> <out dir>
//
// Takes the browser at MUI_VM_CHROMIUM when set, else the runner's Chrome
// (channel chrome), else Playwright's Chromium.
import { chromium } from '@playwright/test';
import path from 'node:path';

const [base, user, password, room, out] = process.argv.slice(2);
if (!out) {
  console.error('usage: lite-vm-browser.mjs <base> <user> <password> <room> <out dir>');
  process.exit(2);
}

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
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // The login's cookies go to the context: occulite_gate at /addons/ is the
  // session the gate passes on
  const login = await context.request.post(`${base}/api/auth/v1/login`, { data: { username: user, password } });
  if (!login.ok()) throw new Error(`login: HTTP ${login.status()}`);

  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`exception: ${e.message}`));
  page.on('requestfailed', (r) => r.url().includes('/addons/mui/') && problems.push(`failed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => r.url().includes('/addons/mui/') && r.status() >= 400 && problems.push(`HTTP ${r.status()}: ${r.url()}`));

  await page.goto(`${base}/addons/mui/?theme=dark&lang=en`, { waitUntil: 'domcontentloaded' });
  // Data over the WebSocket: the room from occulited's metadata
  await page.getByText(room).first().waitFor({ timeout: 60_000 });
  const html = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, lang: document.documentElement.lang }));
  if (html.theme !== 'dark') problems.push(`theme from ?theme=dark: ${html.theme}`);
  if (html.lang !== 'en') problems.push(`language from ?lang=en: ${html.lang}`);
  await page.screenshot({ path: path.join(out, 'app.png'), fullPage: false });
  console.log(`app started: room "${room}" listed, theme ${html.theme}, language ${html.lang}`);
} catch (e) {
  problems.push(String(e?.message ?? e));
} finally {
  await browser.close();
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
