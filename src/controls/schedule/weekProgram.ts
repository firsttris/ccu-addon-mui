import { DatapointValue, ParamsetDescription } from '../../types/types';

// The week program of HmIP actuators (SWITCH_/BLIND_/DIMMER_WEEK_PROFILE
// channel), as the WebUI's HmIPWeeklyProgram.js (OpenCCU-Base) reads and
// writes it: entries NN_WP_* in the channel's MASTER paramset.
//   WP_WEEKDAY          bitmask Sun 1, Mon 2, Tue 4 ... Sat 64; 0 = unused
//   WP_CONDITION        0 fixed time, 1 astro, 2-7 combinations of both
//   WP_FIXED_HOUR/MINUTE, WP_ASTRO_TYPE (0 sunrise, 1 sunset), WP_ASTRO_OFFSET
//   WP_TARGET_CHANNELS  bitmask over the device's virtual channels in order
//   WP_LEVEL            0/1 for switches, 0..1 for blinds and dimmers
//   WP_LEVEL_2          slats of venetian blinds

export type Values = Record<string, DatapointValue>;

export interface WeekProgramEntry {
  // "01".."75"
  number: string;
  weekdays: number;
  condition: number;
  hour: number;
  minute: number;
  astroType: number;
  astroOffset: number;
  targets: number;
  level: number;
  level2?: number;
}

// Days in the order shown (Monday first) with their bit
export const DAYS = [
  { bit: 2, key: 'MONDAY' },
  { bit: 4, key: 'TUESDAY' },
  { bit: 8, key: 'WEDNESDAY' },
  { bit: 16, key: 'THURSDAY' },
  { bit: 32, key: 'FRIDAY' },
  { bit: 64, key: 'SATURDAY' },
  { bit: 1, key: 'SUNDAY' },
] as const;
export const ALL_DAYS = 127;
export const WORKDAYS = 2 | 4 | 8 | 16 | 32;
export const WEEKEND = 64 | 1;

const pad = (n: number) => String(n).padStart(2, '0');
const num = (value: DatapointValue | undefined, fallback = 0) => (typeof value === 'number' ? value : Number(value ?? fallback) || fallback);

// Entry numbers the device has, from its description (75 for most)
export const entryNumbers = (description: ParamsetDescription) =>
  Object.keys(description)
    .map((name) => /^(\d+)_WP_WEEKDAY$/.exec(name)?.[1])
    .filter((n): n is string => n !== undefined)
    .sort();

const read = (values: Values, number: string): WeekProgramEntry => {
  const v = (field: string) => values[`${number}_WP_${field}`];
  return {
    number,
    weekdays: num(v('WEEKDAY')),
    condition: num(v('CONDITION')),
    hour: num(v('FIXED_HOUR')),
    minute: num(v('FIXED_MINUTE')),
    astroType: num(v('ASTRO_TYPE')),
    astroOffset: num(v('ASTRO_OFFSET')),
    targets: num(v('TARGET_CHANNELS')),
    level: num(v('LEVEL')),
    level2: v('LEVEL_2') === undefined ? undefined : num(v('LEVEL_2')),
  };
};

// The entries in use, sorted by time of day
export const parseWeekProgram = (description: ParamsetDescription, values: Values) =>
  entryNumbers(description)
    .map((number) => read(values, number))
    .filter((entry) => entry.weekdays !== 0)
    .sort((a, b) => minutesOf(a) - minutesOf(b) || a.number.localeCompare(b.number));

// Sort key: fixed time, or noon-ish for sunrise/sunset entries
const minutesOf = (entry: WeekProgramEntry) =>
  entry.condition === 1 ? (entry.astroType === 0 ? 6 * 60 : 19 * 60) + entry.astroOffset : entry.hour * 60 + entry.minute;

// A free entry number for a new switching point, or undefined when full
export const freeNumber = (description: ParamsetDescription, values: Values, taken: Set<string>) =>
  entryNumbers(description).find((n) => num(values[`${n}_WP_WEEKDAY`]) === 0 && !taken.has(n));

// The parameters to write for an entry (only those the device has)
export const entryValues = (description: ParamsetDescription, entry: WeekProgramEntry): Values => {
  const out: Values = {};
  const set = (field: string, value: number) => {
    const name = `${entry.number}_WP_${field}`;
    if (name in description) out[name] = value;
  };
  set('WEEKDAY', entry.weekdays);
  set('CONDITION', entry.condition);
  set('FIXED_HOUR', entry.hour);
  set('FIXED_MINUTE', entry.minute);
  set('ASTRO_TYPE', entry.astroType);
  set('ASTRO_OFFSET', entry.astroOffset);
  set('TARGET_CHANNELS', entry.targets);
  set('LEVEL', entry.level);
  if (entry.level2 !== undefined) set('LEVEL_2', entry.level2);
  return out;
};

// Deleting an entry is clearing its weekdays (as the WebUI does)
export const deletedValues = (description: ParamsetDescription, number: string): Values =>
  `${number}_WP_WEEKDAY` in description ? { [`${number}_WP_WEEKDAY`]: 0 } : {};

// Only what differs from the saved values
export const changedValues = (current: Values, next: Values): Values =>
  Object.fromEntries(Object.entries(next).filter(([name, value]) => current[name] !== value));

export const formatTime = (hour: number, minute: number) => `${pad(hour)}:${pad(minute)}`;

// Bits of the target channel mask that are set, as 0-based indexes
export const targetIndexes = (mask: number) =>
  Array.from({ length: 31 }, (_, i) => i).filter((i) => (mask & (1 << i)) !== 0);
