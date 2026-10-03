// Imports the direct link profiles ("easymodes") of the CCU's WebUI from an
// OpenCCU-Base checkout into src/controls/links/linkProfiles.json:
//
//   node scripts/import-link-profiles.mjs /path/to/OpenCCU-Base
//
// Read from www/config/easymodes/<RECEIVER_TYPE>/<SENDER_TYPE>.tcl:
// - set PROFILES_MAP(n) "${key}"          the profile names (0 = expert)
// - set PROFILE_n(PARAM) value            a value, a list of accepted
//   values ({1 3 5}, the first is written) or a range ({7 range 0 - 7})
// - set_htmlParams: per profile (one block per "incr prn") the settings
//   the WebUI shows: getTimeSelector (HmIP time base/factor pairs) and
//   get_ComboBox options A|B (one field setting all named parameters)
// and the texts from its localization/<lang>/ files.
import fs from 'node:fs';
import path from 'node:path';

const RECEIVERS = [
  'SWITCH_VIRTUAL_RECEIVER',
  'DIMMER_VIRTUAL_RECEIVER',
  'BLIND_VIRTUAL_RECEIVER',
  'SHUTTER_VIRTUAL_RECEIVER',
  'SWITCH',
  'DIMMER',
  'BLIND',
];
const LANGS = ['de', 'en'];

const base = process.argv[2];
if (!base) {
  console.error('usage: node scripts/import-link-profiles.mjs /path/to/OpenCCU-Base');
  process.exit(1);
}
const easymodes = path.join(base, 'www/config/easymodes');

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
    for (const m of block.matchAll(/get_ComboBox options ([\w|]+)/g)) {
      // The label is the last <td>${KEY}</td> written before the box
      const before = block.slice(0, m.index);
      const label = [...before.matchAll(/<td>\\?\$\{(\w+)\}<\/td>/g)].pop()?.[1];
      add({ kind: 'value', params: m[1].split('|'), label });
    }
    if (shown.length) fields[n] = shown;
  });

  const texts = Object.fromEntries(
    LANGS.map((lang) => [
      lang,
      {
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
      fields: (fields[n] ?? []).map(({ label, ...field }) => ({
        ...field,
        label: Object.fromEntries(LANGS.map((lang) => [lang, (label && text(lang, label)) || ''])),
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
  result[receiver] = Object.fromEntries(entries);
}

const out = path.join(path.dirname(new URL(import.meta.url).pathname), '../src/controls/links/linkProfiles.json');
fs.writeFileSync(out, JSON.stringify(result) + '\n');
for (const [receiver, senders] of Object.entries(result)) {
  console.log(receiver, Object.keys(senders).length, 'senders');
}
console.log('written', out, fs.statSync(out).size, 'bytes');
