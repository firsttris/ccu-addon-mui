import { describe, expect, it } from 'vitest';
import { ParamsetDescription } from '../../types/types';
import {
  changedValues,
  deletedValues,
  entryValues,
  freeNumber,
  parseWeekProgram,
  targetIndexes,
  Values,
} from './weekProgram';

const fields = [
  'WEEKDAY',
  'CONDITION',
  'FIXED_HOUR',
  'FIXED_MINUTE',
  'ASTRO_TYPE',
  'ASTRO_OFFSET',
  'TARGET_CHANNELS',
  'LEVEL',
];
const description = Object.fromEntries(
  ['01', '02', '03'].flatMap((n) =>
    fields.map((f) => [`${n}_WP_${f}`, { type: 'INTEGER', operations: 7, flags: 1, tabOrder: 0 }]),
  ),
) as unknown as ParamsetDescription;

const values: Values = {
  '01_WP_WEEKDAY': 62, // Mon-Fri
  '01_WP_CONDITION': 0,
  '01_WP_FIXED_HOUR': 17,
  '01_WP_FIXED_MINUTE': 30,
  '01_WP_TARGET_CHANNELS': 1,
  '01_WP_LEVEL': 0,
  '02_WP_WEEKDAY': 127,
  '02_WP_CONDITION': 0,
  '02_WP_FIXED_HOUR': 6,
  '02_WP_FIXED_MINUTE': 15,
  '02_WP_TARGET_CHANNELS': 9,
  '02_WP_LEVEL': 1,
  '03_WP_WEEKDAY': 0,
};

describe('weekProgram', () => {
  it('reads the entries in use, sorted by time', () => {
    const entries = parseWeekProgram(description, values);
    expect(entries.map((e) => [e.number, e.hour, e.minute, e.level])).toEqual([
      ['02', 6, 15, 1],
      ['01', 17, 30, 0],
    ]);
  });

  it('finds a free entry, deletes by clearing the weekdays', () => {
    expect(freeNumber(description, values, new Set())).toBe('03');
    expect(freeNumber(description, values, new Set(['03']))).toBeUndefined();
    expect(deletedValues(description, '01')).toEqual({ '01_WP_WEEKDAY': 0 });
  });

  it('writes only parameters the device has and only changes', () => {
    const [first] = parseWeekProgram(description, values);
    const next = entryValues(description, { ...first, hour: 7, level2: 0.5 });
    expect(next).not.toHaveProperty('02_WP_LEVEL_2');
    expect(changedValues(values, next)).toEqual({
      '02_WP_FIXED_HOUR': 7,
      '02_WP_ASTRO_TYPE': 0,
      '02_WP_ASTRO_OFFSET': 0,
    });
  });

  it('splits the target mask into channel indexes', () => {
    expect(targetIndexes(9)).toEqual([0, 3]);
  });
});
