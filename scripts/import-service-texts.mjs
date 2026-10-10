// Imports the texts the CCU's WebUI shows for service messages from an
// OpenCCU-Base checkout:
//
//   node scripts/import-service-texts.mjs /path/to/OpenCCU-Base
//
// The WebUI looks a message up in www/config/stringtable_de.txt by
// "<DATAPOINT>=TRUE" for a flag, "<DATAPOINT>=<VALUE>" for a value list,
// then "<DATAPOINT>" (rega/esp/functions.fn), and resolves the ${keys}
// with its webui/js/lang/<lang>/translate.lang*.js files. Only the keys
// without a channel type are kept, and no "=FALSE" ones: a message is
// only raised while its datapoint is set.
//
// Written to src/components/serviceMessages/texts.json for the app and to
// go-server/pkg/push/servicetexts.json for push notifications.
import fs from 'node:fs';
import path from 'node:path';

const LANGS = ['de', 'en'];

const base = process.argv[2];
if (!base) {
  console.error('usage: node scripts/import-service-texts.mjs /path/to/OpenCCU-Base');
  process.exit(1);
}
const www = path.join(base, 'www');

// "a" : "b", lines of the WebUI's translation files
const readTexts = (lang) => {
  const texts = {};
  const dir = path.join(www, 'webui/js/lang', lang);
  for (const file of fs.readdirSync(dir).filter((f) => f.startsWith('translate.lang'))) {
    const source = fs.readFileSync(path.join(dir, file), 'latin1');
    for (const match of source.matchAll(/^\s*"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/gm)) {
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
// A stringtable value with its ${keys} resolved, undefined if one is missing
const resolve = (lang, value) => {
  let missing = false;
  const text = value.replace(/\$\{([^}]+)\}/g, (_, key) => {
    const t = texts[lang][key];
    if (t === undefined) missing = true;
    return t ?? '';
  });
  return missing ? undefined : plain(text);
};

const result = {};
const table = fs.readFileSync(path.join(www, 'config/stringtable_de.txt'), 'latin1');
for (const line of table.split('\n')) {
  const [key, value] = line.split('\t');
  if (!key || !value || key.includes('|') || key.endsWith('=FALSE')) continue;
  const entry = {};
  for (const lang of LANGS) {
    const text = resolve(lang, value.trim());
    if (text) entry[lang] = text;
  }
  if (entry.de) result[key.trim()] = entry;
}

const sorted = Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
const json = `${JSON.stringify(sorted, null, 1)}\n`;
for (const out of ['src/components/serviceMessages/texts.json', 'go-server/pkg/push/servicetexts.json']) {
  fs.writeFileSync(out, json);
}
console.log(`${Object.keys(sorted).length} texts`);
