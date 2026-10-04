// Imports the direct link profiles ("easymodes") of the CCU's WebUI from an
// OpenCCU-Base checkout into src/controls/links/profiles/<RECEIVER_TYPE>.json
// (one file per receiver type, loaded only when a link needs it):
//
//   node scripts/import-link-profiles.mjs /path/to/OpenCCU-Base
//
// Read from www/config/easymodes/<RECEIVER_TYPE>/<SENDER_TYPE>.tcl:
// - set PROFILES_MAP(n) "${key}"          the profile names (0 = expert)
// - set PROFILE_n(PARAM) value            a value, a list of accepted
//   values ({1 3 5}, the first is written) or a range ({7 range 0 - 7})
// - set_htmlParams: per profile (one block per "incr prn") the settings
//   the WebUI shows: getTimeSelector (HmIP time base/factor pairs) and
//   get_ComboBox options A|B (one field setting all named parameters),
//   with the texts of its choices (set options(n) "${key}")
// and the texts from its localization/<lang>/ files (and the WebUI's
// translate.lang.option.js for choices).
import fs from 'node:fs';
import path from 'node:path';

const LANGS = ['de', 'en'];

const base = process.argv[2];
if (!base) {
  console.error('usage: node scripts/import-link-profiles.mjs /path/to/OpenCCU-Base');
  process.exit(1);
}
const easymodes = path.join(base, 'www/config/easymodes');
// Every receiver type with its own directory of <SENDER_TYPE>.tcl files
const RECEIVERS = fs
  .readdirSync(easymodes, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^[A-Z][A-Z0-9_()]+$/.test(d.name) && d.name !== 'MASTER_LANG')
  .map((d) => d.name)
  .sort();

// "a" : "b", lines of the localization files
const readTexts = (file) => {
  const texts = {};
  if (!fs.existsSync(file)) return texts;
  const source = fs.readFileSync(file, 'latin1');
  for (const match of source.matchAll(/^\s*"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/gm)) {
    texts[match[1]] = match[2];
  }
  return texts;
};

const entities = { auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', amp: '&', nbsp: ' ', quot: '"', deg: '°' };
const plain = (html) =>
  html
    .replace(/\\"/g, '"')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&([a-zA-Z]+);?/g, (all, name) => entities[name] ?? all)
    .replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\s+/g, ' ')
    .trim();

// A Tcl value: a word or a braced list
const parseValue = (raw) => {
  const text = raw.trim();
  const list = text.startsWith('{') ? text.slice(1, text.lastIndexOf('}')).trim().split(/\s+/) : [text];
  if (list[1] === 'range') {
    const [def, , min, , max] = list.map(Number);
    if ([def, min, max].some(Number.isNaN)) return undefined;
    return { default: def, min, max };
  }
  const values = list.map(Number);
  return values.some(Number.isNaN) ? undefined : values;
};

const parseFile = (receiver, file) => {
  const sender = path.basename(file, '.tcl');
  const source = fs.readFileSync(file, 'latin1');
  const names = {};
  for (const m of source.matchAll(/^\s*set PROFILES_MAP\((\d+)\)\s+"\\?\$\{(\w+)\}"/gm)) names[m[1]] = m[2];
  const values = {};
  const lists = {};
  for (const m of source.matchAll(/^\s*set PROFILE_(\d+)\((\w+)\)\s+(\{[^}]*\}|\S+)/gm)) {
    const [, n, param, raw] = m;
    if (param === 'UI_WHITELIST' || param === 'UI_BLACKLIST') {
      (lists[n] ??= {})[param === 'UI_WHITELIST' ? 'whitelist' : 'blacklist'] = raw.replace(/[{}]/g, '').trim().split(/\s+/);
      continue;
    }
    if (param.startsWith('UI_')) continue;
    const value = parseValue(raw);
    if (value !== undefined) (values[n] ??= {})[param] = value;
  }
  // Settings shown per profile
  const fields = {};
  const html = source.slice(source.indexOf('proc set_htmlParams'));
  const blocks = html.split(/\bincr prn\b/);
  blocks.forEach((block, n) => {
    const shown = [];
    const add = (field) => {
      if (!shown.some((f) => f.params.join() === field.params.join())) shown.push(field);
    };
    for (const m of block.matchAll(/getTimeSelector\s+(\w+)\s+ps\s+PROFILE_\$prn\s+(\w+)\s+\$prn\s+\$special_input_id\s+(\w+)/g)) {
      add({ kind: 'time', params: [m[3]], label: m[1] });
    }
    for (const m of block.matchAll(/get_ComboBox options (\$param|[\w|]+)/g)) {
      // The label is the last <td>${KEY}</td> written before the box
      const before = block.slice(0, m.index);
      // "$param": the parameter set last (set param NAME)
      const params = m[1] === '$param' ? [...before.matchAll(/set param (\w+)/g)].pop()?.[1] : m[1];
      if (!params) continue;
      const label = [...before.matchAll(/<td>\\?\$\{(\w+)\}<\/td>/g)].pop()?.[1];
      // Its choices: set since the last array_clear options
      const since = before.slice(before.lastIndexOf('array_clear options'));
      const options = Object.fromEntries(
        [...since.matchAll(/set options\((\d+)\)\s+"\\?\$\{(\w+)\}"/g)].map((o) => [o[1], o[2]]),
      );
      add({ kind: 'value', params: params.split('|'), label, ...(Object.keys(options).length ? { options } : {}) });
    }
    if (shown.length) fields[n] = shown;
  });

  const texts = Object.fromEntries(
    LANGS.map((lang) => [
      lang,
      {
        ...readTexts(path.join(base, 'www/webui/js/lang', lang, 'translate.lang.option.js')),
        ...readTexts(path.join(easymodes, 'etc/localization', lang, 'PNAME.txt')),
        ...readTexts(path.join(easymodes, 'etc/localization', lang, 'GENERIC.txt')),
        ...readTexts(path.join(easymodes, receiver, 'localization', lang, 'GENERIC.txt')),
        ...readTexts(path.join(easymodes, receiver, 'localization', lang, `${sender}.txt`)),
      },
    ]),
  );
  const text = (lang, key) => (texts[lang][key] ? plain(texts[lang][key]) : undefined);

  const profiles = Object.keys(names)
    .map(Number)
    .filter((n) => n > 0 && values[n])
    .sort((a, b) => a - b)
    .map((n) => ({
      id: n,
      name: Object.fromEntries(LANGS.map((lang) => [lang, text(lang, names[n]) ?? names[n]])),
      description: Object.fromEntries(LANGS.map((lang) => [lang, text(lang, `description_${n}`) ?? ''])),
      values: values[n],
      fields: (fields[n] ?? []).map(({ label, options, ...field }) => ({
        ...field,
        label: Object.fromEntries(LANGS.map((lang) => [lang, (label && text(lang, label)) || ''])),
        ...(options
          ? {
              options: Object.fromEntries(
                Object.entries(options).map(([value, key]) => [
                  value,
                  Object.fromEntries(LANGS.map((lang) => [lang, text(lang, key) ?? key])),
                ]),
              ),
            }
          : {}),
      })),
      ...(lists[n] ?? {}),
    }));
  return profiles.length ? [sender, profiles] : undefined;
};

const result = {};
for (const receiver of RECEIVERS) {
  const dir = path.join(easymodes, receiver);
  const entries = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.tcl'))
    .sort()
    .map((f) => parseFile(receiver, path.join(dir, f)))
    .filter(Boolean);
  if (entries.length) result[receiver] = Object.fromEntries(entries);
}

const outDir = path.join(path.dirname(new URL(import.meta.url).pathname), '../src/controls/links/profiles');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
let total = 0;
for (const [receiver, senders] of Object.entries(result)) {
  const file = path.join(outDir, `${receiver}.json`);
  fs.writeFileSync(file, JSON.stringify(senders) + '\n');
  total += fs.statSync(file).size;
  console.log(receiver, Object.keys(senders).length, 'senders');
}
console.log('written', Object.keys(result).length, 'files to', outDir, total, 'bytes');
