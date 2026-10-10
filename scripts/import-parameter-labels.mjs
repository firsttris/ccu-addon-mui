// Imports the names the CCU's WebUI shows for device settings and values
// from an OpenCCU-Base checkout:
//
//   node scripts/import-parameter-labels.mjs /path/to/OpenCCU-Base /path/to/OpenCCU
//
// The WebUI writes a parameter as <span class="stringtable_value">TYPE|NAME
// </span> (config/ic_deviceparameters.cgi) and looks it up with
// st_getValue in webui.js: first "TYPE|NAME", then "NAME", in its table
// elvST['…'] = '${key} …'; the ${keys} come from webui/js/lang/<lang>/
// translate.lang*.js. With an OpenCCU checkout its WebUI patches are laid
// over OpenCCU-Base (rootfs-patches/*/rootfs/www, in order), as on the CCU.
// Entries for a value ("NAME=VALUE") are left out: these are the names only,
// and so are the "TYPE|NAME" ones: the app looks a name up without the
// channel type.
//
// Written to src/controls/generic/parameterLabels.json.
import fs from 'node:fs';
import path from 'node:path';

const LANGS = ['de', 'en'];

const [base, openccu] = process.argv.slice(2);
if (!base) {
  console.error('usage: node scripts/import-parameter-labels.mjs /path/to/OpenCCU-Base [/path/to/OpenCCU]');
  process.exit(1);
}
if (!openccu) console.warn('warning: without an OpenCCU checkout its WebUI patches are missing');

// The files of www/ by path, the patched ones from OpenCCU's patch series
const overlay = new Map();
if (openccu) {
  const patches = path.join(openccu, 'buildroot-external/package/openccu-base/rootfs-patches');
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), relPath);
      else if (!/\.(orig|rej)$/.test(entry.name)) overlay.set(relPath, path.join(dir, entry.name));
    }
  };
  for (const patch of fs.readdirSync(patches).sort()) {
    const www = path.join(patches, patch, 'rootfs/www');
    if (fs.existsSync(www)) walk(www, '');
  }
}
const wwwPath = (rel) => overlay.get(rel) ?? path.join(base, 'www', rel);
const read = (rel) => fs.readFileSync(wwwPath(rel), 'latin1');

// "a" : "b", lines of the WebUI's translation files
const readTexts = (lang) => {
  const texts = {};
  const dir = `webui/js/lang/${lang}`;
  const files = new Set(fs.readdirSync(path.join(base, 'www', dir)));
  for (const key of overlay.keys()) if (key.startsWith(dir + '/')) files.add(key.slice(dir.length + 1));
  for (const file of [...files].filter((f) => f.startsWith('translate.lang')).sort()) {
    for (const match of read(`${dir}/${file}`).matchAll(/^\s*"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/gm)) {
      texts[match[1]] ??= match[2];
    }
  }
  return texts;
};

const entities = {
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  amp: '&',
  nbsp: ' ',
  quot: '"',
  deg: '°',
};
const plain = (html) =>
  html
    .replace(/\\"/g, '"')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&([a-zA-Z]+);?/g, (all, name) => entities[name] ?? all)
    .replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\s+/g, ' ')
    .trim();

const texts = Object.fromEntries(LANGS.map((lang) => [lang, readTexts(lang)]));
// A table value with its ${keys} resolved, undefined if one is missing
const resolve = (lang, value) => {
  let missing = false;
  const text = value.replace(/\$\{([^}]+)\}/g, (_, key) => {
    const t = texts[lang][key];
    if (t === undefined) missing = true;
    return t ?? '';
  });
  return missing ? undefined : plain(text);
};

// elvST['KEY'] = '…'; the last assignment wins, as in the browser
const table = {};
for (const match of read('webui/webui.js').matchAll(/^elvST\['([^']+)'\]\s*=\s*'((?:[^'\\]|\\.)*)'/gm)) {
  if (!/[=|]/.test(match[1])) table[match[1]] = match[2];
}

const labels = Object.fromEntries(LANGS.map((lang) => [lang, {}]));
let unresolved = 0;
for (const [key, value] of Object.entries(table).sort(([a], [b]) => a.localeCompare(b))) {
  for (const lang of LANGS) {
    const text = resolve(lang, value);
    if (text) labels[lang][key] = text;
    else if (lang === 'de') unresolved++;
  }
}

const out = 'src/controls/generic/parameterLabels.json';
fs.writeFileSync(out, JSON.stringify(labels, null, 1) + '\n');
console.log(
  `${Object.keys(labels.de).length} names (de), ${Object.keys(labels.en).length} (en), ${unresolved} without a text -> ${out}`,
);
