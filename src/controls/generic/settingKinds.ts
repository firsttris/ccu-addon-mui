import { getLocale } from '../../paraglide/runtime';
import { formatNumber } from '../../lib/utils';
import type { ParameterDescription } from '../../types/types';
import { humanize, parameterLabel } from './parameters';

// How a device setting (MASTER parameter) is best edited, from its type,
// range, unit and name, so the settings need no text fields where a
// switch, a choice, a slider or a duration fits better. The WebUI does this
// per device in its easymodes (uiElements.tcl: getTimeSelector for the
// *_BASE/*_FACTOR pairs, options.tcl TIMEBASE_*); here the same follows
// from the descriptions, for every device.

export type Setting =
  | { kind: 'single'; name: string; parameter: ParameterDescription }
  // A time as number and unit, e.g. EVENT_DELAY_VALUE + EVENT_DELAY_UNIT or
  // ON_TIME_FACTOR + ON_TIME_BASE
  | {
      kind: 'duration';
      name: string;
      valueName: string;
      unitName: string;
      value: ParameterDescription;
      unit: ParameterDescription;
    };

export type Control =
  | 'switch'
  | 'choice'
  | 'segmented'
  | 'percent'
  | 'stepper'
  | 'number'
  | 'timeOfDay'
  | 'month'
  | 'text'
  | 'action'
  | 'readonly';

const PAIRS: [string, string][] = [
  ['_VALUE', '_UNIT'],
  ['_FACTOR', '_BASE'],
];

// Groups the value and unit of a time into one setting; anything without
// its partner stays on its own
export const combineSettings = (entries: [string, ParameterDescription][]): Setting[] => {
  const byName = new Map(entries);
  const used = new Set<string>();
  const settings: Setting[] = [];
  for (const [name, parameter] of entries) {
    if (used.has(name)) continue;
    const pair = PAIRS.find(([valueSuffix, unitSuffix]) => name.endsWith(valueSuffix) || name.endsWith(unitSuffix));
    if (pair) {
      const [valueSuffix, unitSuffix] = pair;
      const base = name.slice(0, name.length - (name.endsWith(valueSuffix) ? valueSuffix.length : unitSuffix.length));
      const valueName = base + valueSuffix;
      const unitName = base + unitSuffix;
      const value = byName.get(valueName);
      const unit = byName.get(unitName);
      if (
        value &&
        unit &&
        unit.type === 'ENUM' &&
        (value.type === 'INTEGER' || value.type === 'FLOAT') &&
        unitSeconds(unit.valueList?.[0] ?? '') !== undefined
      ) {
        used.add(valueName).add(unitName);
        settings.push({
          kind: 'duration',
          name: base,
          valueName,
          unitName,
          value,
          unit,
        });
        continue;
      }
    }
    used.add(name);
    settings.push({ kind: 'single', name, parameter });
  }
  return settings;
};

// The readable name of a duration: its own (EVENT_DELAY), else the
// value's name without "(Wert)"
export const durationLabel = (setting: Extract<Setting, { kind: 'duration' }>) => {
  const own = parameterLabel(setting.name);
  if (own !== humanize(setting.name)) return own;
  const label = parameterLabel(setting.valueName);
  const stripped = label.replace(/\s*\((Wert|value|Faktor|factor)\)$/i, '');
  return stripped !== label ? stripped : own;
};

// Seconds of a time unit as the CCU names it: 100MS, 10MS, 1S, S, 5S, 1M,
// M, 10M, H, 1H, BASE_100_MS, BASE_1_D …
export const unitSeconds = (unit: string): number | undefined => {
  const match = /^(?:BASE_)?(\d+)?_?(MS|S|M|H|D)$/.exec(unit);
  if (!match) return undefined;
  const count = match[1] ? Number(match[1]) : 1;
  const factor = { MS: 0.001, S: 1, M: 60, H: 3600, D: 86400 }[match[2] as 'MS' | 'S' | 'M' | 'H' | 'D'];
  return count * factor;
};

const unitWords = () =>
  getLocale() === 'de'
    ? { MS: 'ms', S: 's', M: 'min', H: 'h', D: 'Tag' }
    : { MS: 'ms', S: 's', M: 'min', H: 'h', D: 'day' };

// "100MS" → "100 ms", "M" → "min", "BASE_1_D" → "1 Tag"
export const unitLabel = (unit: string): string => {
  const match = /^(?:BASE_)?(\d+)?_?(MS|S|M|H|D)$/.exec(unit);
  if (!match) return enumLabel(unit);
  const word = unitWords()[match[2] as 'MS' | 'S' | 'M' | 'H' | 'D'];
  return match[1] ? `${match[1]} ${word}` : word;
};

// A setting's number in the app's language, at most two decimals by default
export const number = (value: number, digits = 2) => formatNumber(value, digits);

// A duration in seconds, readable: "2 min 30 s", "1,5 s", "1 h", "0 s"
export const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${number(seconds)} s`;
  const parts: string[] = [];
  let rest = Math.round(seconds);
  const days = Math.floor(rest / 86400);
  rest -= days * 86400;
  const hours = Math.floor(rest / 3600);
  rest -= hours * 3600;
  const minutes = Math.floor(rest / 60);
  rest -= minutes * 60;
  if (days) parts.push(getLocale() === 'de' ? `${days} ${days === 1 ? 'Tag' : 'Tage'}` : `${days} d`);
  if (hours) parts.push(`${hours} h`);
  if (minutes) parts.push(`${minutes} min`);
  if (rest) parts.push(`${rest} s`);
  return parts.join(' ');
};

const range = (p: ParameterDescription) =>
  typeof p.min === 'number' && typeof p.max === 'number' ? { min: p.min, max: p.max } : undefined;

// Levels 0..1 (unit "100%", or valve positions without a unit) are shown
// as percent; so are integers 0..100 named as a position or level
export const isPercentSetting = (name: string, p: ParameterDescription) => {
  if (p.unit === '100%') return true;
  const r = range(p);
  if (!r) return false;
  if (p.type === 'FLOAT' && !p.unit && r.min === 0 && r.max === 1) return true;
  return p.type === 'INTEGER' && !p.unit && r.min === 0 && r.max === 100 && /(POSITION|LEVEL)/.test(name);
};

// Minutes of the day in 15-minute steps (DST_*_TIME 0..1425) or half
// hours (DECALCIFICATION_TIME 0..47)
export const timeOfDayStep = (name: string, p: ParameterDescription): number | undefined => {
  const r = range(p);
  if (!r || p.type !== 'INTEGER' || !/_TIME$/.test(name) || r.min !== 0) return undefined;
  if (r.max === 1425 || r.max === 1439) return 1;
  if (r.max === 47) return 30;
  return undefined;
};

export const controlOf = (name: string, p: ParameterDescription, writable: boolean): Control => {
  if (p.type === 'ACTION') return writable ? 'action' : 'readonly';
  if (!writable) return 'readonly';
  switch (p.type) {
    case 'BOOL':
      return 'switch';
    case 'ENUM': {
      const options = p.valueList ?? [];
      const short = options.every((o) => enumLabel(o).length <= 16);
      return options.length <= 3 && short ? 'segmented' : 'choice';
    }
    case 'STRING':
      return 'text';
    case 'INTEGER':
    case 'FLOAT': {
      if (isPercentSetting(name, p)) return 'percent';
      if (timeOfDayStep(name, p)) return 'timeOfDay';
      const r = range(p);
      if (/_MONTH$/.test(name) && r?.min === 1 && r.max === 12) return 'month';
      if (r && (r.max - r.min) / stepOf(name, p) <= 400) return 'stepper';
      return 'number';
    }
  }
  return 'readonly';
};

// The step of the − and + buttons: half degrees for temperatures, tenths
// for small decimal ranges, else whole numbers
export const stepOf = (name: string, p: ParameterDescription) => {
  if (p.type === 'INTEGER') return 1;
  const r = range(p);
  if (p.unit === '°C' || p.unit === 'K' || /TEMPERATURE/.test(name)) {
    return r && r.max - r.min <= 4 ? 0.1 : 0.5;
  }
  if (r && r.max - r.min <= 30) return 0.1;
  return 1;
};

// "09:30" from minutes of the day
export const formatTimeOfDay = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// Readable names of the values ENUM parameters commonly have, as the
// WebUI's stringtable names them
const ENUM_LABELS: Record<string, [string, string]> = {
  OFF: ['Aus', 'Off'],
  ON: ['Ein', 'On'],
  ON_DELAY: ['Einschaltverzögerung', 'On delay'],
  OFF_DELAY: ['Ausschaltverzögerung', 'Off delay'],
  NOT_SWAPPED: ['Nicht getauscht', 'Not swapped'],
  SWAPPED: ['Getauscht', 'Swapped'],
  NORMAL_MODE: ['Normal', 'Normal'],
  SILENT_MODE: ['Leise', 'Silent'],
  THERMOSTAT: ['Thermostat', 'Thermostat'],
  HYGROSTAT: ['Hygrostat', 'Hygrostat'],
  HEATING: ['Heizen', 'Heating'],
  COOLING: ['Kühlen', 'Cooling'],
  HEATING_COOLING: ['Heizen und Kühlen', 'Heating and cooling'],
  NO_MSG: ['Keine Meldung', 'No message'],
  CLOSED: ['Geschlossen', 'Closed'],
  OPEN: ['Offen', 'Open'],
  TILTED: ['Gekippt', 'Tilted'],
  INACTIVE_DEFAULT: ['Inaktiv (Standard)', 'Inactive (default)'],
  INACTIVE: ['Inaktiv', 'Inactive'],
  ACTIVE: ['Aktiv', 'Active'],
  DEAKTIV: ['Deaktiviert', 'Disabled'],
  AKTIV: ['Aktiv', 'Active'],
  AUTOMODE: ['Im Automatikbetrieb', 'In auto mode'],
  AUTO_MANUMODE: ['Automatik und Manuell', 'Auto and manual mode'],
  AUTO_PARTYMODE: ['Automatik und Party', 'Auto and party mode'],
  SHUTTER: ['Rollladen', 'Shutter'],
  BLIND: ['Jalousie', 'Blind'],
  SUNRISE: ['Sonnenaufgang', 'Sunrise'],
  SUNSET: ['Sonnenuntergang', 'Sunset'],
  FIXED: ['Feste Uhrzeit', 'Fixed time'],
  FIXED_TIME: ['Feste Uhrzeit', 'Fixed time'],
  ASTRO: ['Astro', 'Astro'],
  LOW: ['Niedrig', 'Low'],
  MID: ['Mittel', 'Medium'],
  HIGH: ['Hoch', 'High'],
  VERY_HIGH: ['Sehr hoch', 'Very high'],
  LEFT: ['Links', 'Left'],
  RIGHT: ['Rechts', 'Right'],
  NORMALLY_CLOSE: ['Öffner (normal geschlossen)', 'Normally closed'],
  NORMALLY_OPEN: ['Schließer (normal offen)', 'Normally open'],
  SUNDAY: ['Sonntag', 'Sunday'],
  MONDAY: ['Montag', 'Monday'],
  TUESDAY: ['Dienstag', 'Tuesday'],
  WEDNESDAY: ['Mittwoch', 'Wednesday'],
  THURSDAY: ['Donnerstag', 'Thursday'],
  FRIDAY: ['Freitag', 'Friday'],
  SATURDAY: ['Samstag', 'Saturday'],
  '1.WEEK': ['1. Woche', '1st week'],
  '2.WEEK': ['2. Woche', '2nd week'],
  '3.WEEK': ['3. Woche', '3rd week'],
  '4.WEEK': ['4. Woche', '4th week'],
  LAST: ['Letzte Woche', 'Last week'],
  RESERVED: ['–', '–'],
  LOGIC_INACTIVE: ['Inaktiv', 'Inactive'],
  LOGIC_OR: ['ODER', 'OR'],
  LOGIC_AND: ['UND', 'AND'],
  LOGIC_XOR: ['Exklusiv-ODER', 'XOR'],
  LOGIC_NOR: ['NOR', 'NOR'],
  LOGIC_NAND: ['NAND', 'NAND'],
  LOGIC_ORINVERS: ['ODER invertiert', 'OR inverted'],
  LOGIC_ANDINVERS: ['UND invertiert', 'AND inverted'],
  LOGIC_PLUS: ['PLUS', 'PLUS'],
  LOGIC_MINUS: ['MINUS', 'MINUS'],
  LOGIC_MUL: ['MAL', 'MUL'],
  LOGIC_PLUSINVERS: ['PLUS invertiert', 'PLUS inverted'],
  LOGIC_MINUSINVERS: ['MINUS invertiert', 'MINUS inverted'],
  LOGIC_MULINVERS: ['MAL invertiert', 'MUL inverted'],
  LOGIC_INVERSPLUS: ['Invertiert PLUS', 'Inverted PLUS'],
  LOGIC_INVERSMINUS: ['Invertiert MINUS', 'Inverted MINUS'],
  LOGIC_INVERSMUL: ['Invertiert MAL', 'Inverted MUL'],
  SET_TEMPERATURE_CHANGE_BY_ALL: ['Von allen', 'By all'],
  SET_TEMPERATURE_CHANGE_BY_NONE: ['Von niemandem', 'By none'],
  SET_TEMPERATURE_CHANGE_ONLY_BY_CCU: ['Nur von der Zentrale', 'Only by the central unit'],
  SET_TEMPERATURE_CHANGE_ONLY_BY_SELF: ['Nur am Gerät selbst', 'Only at the device itself'],
  SET_TEMPERATURE_CHANGE_ONLY_BY_RT_TC_SC_SELF: [
    'Gerät, Wandthermostat und Fernbedienung',
    'Device, wall thermostat and remote',
  ],
  SET_TEMPERATURE_CHANGE_ONLY_BY_RT_TC_CCU_SELF: [
    'Gerät, Wandthermostat und Zentrale',
    'Device, wall thermostat and central unit',
  ],
  PERMANENT_LISTENER: ['Ständig empfangsbereit', 'Permanent listener'],
  EVENT_LISTENER: ['Bei Ereignis', 'Event listener'],
  CYCLIC_LISTENER: ['Zyklisch', 'Cyclic listener'],
};

// The readable name of an ENUM value; unknown ones made readable
export const enumLabel = (value: string): string => {
  const known = ENUM_LABELS[value];
  if (known) return getLocale() === 'de' ? known[0] : known[1];
  if (unitSeconds(value) !== undefined) return unitLabel(value);
  return humanize(value);
};

const MONTHS = {
  de: [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ],
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
};
export const monthName = (month: number) => (getLocale() === 'de' ? MONTHS.de : MONTHS.en)[month - 1] ?? String(month);
