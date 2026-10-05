// Replaces the app's scripts and styles in the add-on archive by their
// gzip-compressed form (file.js -> file.js.gz). The CCU's lighttpd can't
// compress; the server sends them as they are (go-server/pkg/websocket/
// assets.go). Fonts and images are already compressed and stay.
import { readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, constants } from 'node:zlib';

const dir = process.argv[2] ?? 'addon_installer/dist/assets';
const compressible = /\.(js|css|svg|json|txt|map)$/;
let before = 0;
let after = 0;
for (const name of readdirSync(dir)) {
  if (!compressible.test(name)) continue;
  const path = join(dir, name);
  const data = readFileSync(path);
  const packed = gzipSync(data, { level: constants.Z_BEST_COMPRESSION });
  writeFileSync(`${path}.gz`, packed);
  unlinkSync(path);
  before += data.length;
  after += packed.length;
}
console.log(`assets: ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB gzip`);
