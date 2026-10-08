// Serves the app under /addons/mui/ as lighttpd does on the CCU, first the
// installed version; GET /__update swaps in the new one, as the add-on's
// update_script replaces the files (e2e-update/update.spec.ts)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.PORT ?? 4202);
const FIXTURE = path.resolve('e2e-update/.fixture');
const BASE = '/addons/mui/';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
};

let served = 'installed';

const file = async (relative) => {
  const full = path.join(FIXTURE, served, relative);
  if (!full.startsWith(path.join(FIXTURE, served))) return null;
  try {
    return (await stat(full)).isFile() ? full : null;
  } catch {
    return null;
  }
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/__update') {
    served = 'new';
    res.end('new');
    return;
  }
  if (url.pathname === '/__reset') {
    served = 'installed';
    res.end('installed');
    return;
  }
  if (!url.pathname.startsWith(BASE)) {
    res.writeHead(302, { Location: BASE }).end();
    return;
  }
  // The app's routes are answered with index.html, as on the CCU
  const found = (await file(decodeURIComponent(url.pathname.slice(BASE.length)))) ?? (await file('index.html'));
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(found)] ?? 'application/octet-stream' });
  res.end(await readFile(found));
}).listen(PORT, '127.0.0.1');
