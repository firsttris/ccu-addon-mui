// Imports the direct link profiles ("easymodes") of the CCU's WebUI from an
// OpenCCU-Base checkout into src/controls/links/profiles/<RECEIVER_TYPE>.json
// (one file per receiver type, loaded only when a link needs it):
//
//   node scripts/import-link-profiles.mjs /path/to/OpenCCU-Base /path/to/OpenCCU
//
// With an OpenCCU checkout its WebUI patches are laid over OpenCCU-Base
// (buildroot-external/package/openccu-base/rootfs-patches/*/rootfs/www, in
// order), as on the CCU: e.g. 0195-WebUI-Fix-MissingDimmerDefinition
// replaces files under DIMMER_VIRTUAL_RECEIVER.
//
// Read from www/config/easymodes/<RECEIVER_TYPE>/<SENDER_TYPE>.tcl:
// - set PROFILES_MAP(n) "${key}"          the profile names (0 = expert)
// - set PROFILE_n(PARAM) value            a value, a list of accepted
//   values ({1 3 5}, the first is written) or a range ({7 range 0 - 7});
//   $NAME and [subst {$A $B}] use the file's own "set NAME 3" constants
//   (the jump tables of blinds and dimmers), true/false are 1/0. A value
//   that can't be read stops the import instead of leaving it out.
// - set_htmlParams: per profile (one block per "incr prn") the settings
//   the WebUI shows: getTimeSelector (HmIP time base/factor pairs) and
//   get_ComboBox options A|B (one field setting all named parameters),
//   with the texts of its choices (set options(n) "${key}")
// and the texts from its localization/<lang>/ files (and the WebUI's
// translate.lang.option.js for choices).
import fs from 'node:fs';
import path from 'node:path';

const LANGS = ['de', 'en'];

const [base, openccu] = process.argv.slice(2);
if (!base) {
  console.error('usage: node scripts/import-link-profiles.mjs /path/to/OpenCCU-Base [/path/to/OpenCCU]');
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
const wwwExists = (rel) => overlay.has(rel) || fs.existsSync(path.join(base, 'www', rel));
// The entries of a www/ directory: files and subdirectories
const wwwList = (rel) => {
  const dir = path.join(base, 'www', rel);
  const files = new Set();
  const dirs = new Set();
  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }))
      (entry.isDirectory() ? dirs : files).add(entry.name);
  }
  for (const key of overlay.keys()) {
    if (!key.startsWith(rel + '/')) continue;
    const [first, ...rest] = key.slice(rel.length + 1).split('/');
    (rest.length ? dirs : files).add(first);
  }
  return { files: [...files].sort(), dirs: [...dirs].sort() };
};

const easymodes = 'config/easymodes';
// Every receiver type with its own directory of <SENDER_TYPE>.tcl files
const RECEIVERS = wwwList(easymodes).dirs.filter((d) => /^[A-Z][A-Z0-9_()]+$/.test(d) && d !== 'MASTER_LANG');

// "a" : "b", lines of the localization files
const readTexts = (rel) => {
  const texts = {};
  if (!wwwExists(rel)) return texts;
  const source = fs.readFileSync(wwwPath(rel), 'latin1');
  for (const match of source.matchAll(/^\s*"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/gm)) {
    texts[match[1]] = match[2];
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

// A Tcl word as number: true/false are what the WebUI writes as 1/0
const tclNumber = (word) => (word === 'true' ? 1 : word === 'false' ? 0 : Number(word));

// A Tcl value: a word, a braced list or [subst {...}], with $NAME taken
// from vars
const parseValue = (raw, vars) => {
  let text = raw.trim();
  const subst = text.match(/^\[subst\s+(\{[^}]*\})\]$/);
  if (subst) text = subst[1];
  text = text.replace(/\$(\w+)/g, (all, name) => vars[name] ?? all);
  const list = text.startsWith('{') ? text.slice(1, text.lastIndexOf('}')).trim().split(/\s+/) : [text];
  if (list[1] === 'range') {
    const [def, , min, , max] = list.map(tclNumber);
    if ([def, min, max].some(Number.isNaN)) return undefined;
    return { default: def, min, max };
  }
  const values = list.map(tclNumber);
  return values.some(Number.isNaN) ? undefined : values;
};

// A file's text with the files it sources that set profiles (a receiver's
// profiles.tcl) put in place, as Tcl runs them
const readSourced = (rel) =>
  fs
    .readFileSync(wwwPath(rel), 'latin1')
    .replace(/^\s*source \[file join \$env\(DOCUMENT_ROOT\) (config\/easymodes\/\S+\.tcl)\]\s*$/gm, (line, sourced) => {
      if (!wwwExists(sourced)) return line;
      const text = readSourced(sourced);
      return /^\s*set PROFILE/m.test(text) ? text : line;
    });

const parseFile = (receiver, rel) => {
  const sender = path.basename(rel, '.tcl');
  const source = readSourced(rel);
  // Files a sender sources (profiles.tcl) are no sender of their own
  if (!/^\s*set PROFILES_MAP\(/m.test(source)) return undefined;
  const names = {};
  for (const m of source.matchAll(/^\s*set PROFILES_MAP\((\d+)\)\s+"\\?\$\{(\w+)\}"/gm)) names[m[1]] = m[2];
  const values = {};
  const lists = {};
  // Line by line: a constant counts from where it is set
  const vars = {};
  source.split('\n').forEach((line, i) => {
    const constant = line.match(/^\s*set ([A-Z][A-Z0-9_]*)\s+(-?[0-9.]+)\s*$/);
    if (constant) {
      vars[constant[1]] = constant[2];
      return;
    }
    const m = line.match(/^\s*set PROFILE_(\d+)\((\w+)\)\s+(\[subst\s+\{[^}]*\}\]|\{[^}]*\}|\S+)/);
    if (!m) return;
    const [, n, param, raw] = m;
    if (param === 'UI_WHITELIST' || param === 'UI_BLACKLIST') {
      (lists[n] ??= {})[param === 'UI_WHITELIST' ? 'whitelist' : 'blacklist'] = raw
        .replace(/[{}]/g, '')
        .trim()
        .split(/\s+/);
      return;
    }
    if (param.startsWith('UI_')) return;
    const value = parseValue(raw, vars);
    if (value === undefined) throw new Error(`${rel}:${i + 1}: can't read the value of PROFILE_${n}(${param}): ${raw}`);
    (values[n] ??= {})[param] = value;
  });
  // Settings shown per profile
  const fields = {};
  const html = source.slice(source.indexOf('proc set_htmlParams'));
  const blocks = html.split(/\bincr prn\b/);
  blocks.forEach((block, n) => {
    const shown = [];
    const add = (field) => {
      if (!shown.some((f) => f.params.join() === field.params.join())) shown.push(field);
    };
    for (const m of block.matchAll(
      /getTimeSelector\s+(\w+)\s+ps\s+PROFILE_\$prn\s+(\w+)\s+\$prn\s+\$special_input_id\s+(\w+)/g,
    )) {
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
      add({
        kind: 'value',
        params: params.split('|'),
        label,
        ...(Object.keys(options).length ? { options } : {}),
      });
    }
    if (shown.length) fields[n] = shown;
  });

  const texts = Object.fromEntries(
    LANGS.map((lang) => [
      lang,
      {
        ...readTexts(`webui/js/lang/${lang}/translate.lang.option.js`),
        ...readTexts(`${easymodes}/etc/localization/${lang}/PNAME.txt`),
        ...readTexts(`${easymodes}/etc/localization/${lang}/GENERIC.txt`),
        ...readTexts(`${easymodes}/${receiver}/localization/${lang}/GENERIC.txt`),
        ...readTexts(`${easymodes}/${receiver}/localization/${lang}/${sender}.txt`),
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
  const dir = `${easymodes}/${receiver}`;
  const entries = wwwList(dir)
    .files.filter((f) => f.endsWith('.tcl'))
    .map((f) => parseFile(receiver, `${dir}/${f}`))
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
