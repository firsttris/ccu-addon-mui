import { describe, expect, it } from 'vitest';
import {
  changedValues,
  nextChange,
  profileLayout,
  readDay,
  readWeek,
  removeSlot,
  setSlotEnd,
  setSlotTemperature,
  splitSlot,
  temperatureAt,
  writeDay,
} from './weekProfile';
import { ParamsetDescription } from '../../../types/types';

const description = Object.fromEntries(
  [1, 2].flatMap((p) =>
    ['MONDAY', 'SUNDAY'].flatMap((day) =>
      Array.from({ length: 13 }, (_, i) => [
        [`P${p}_ENDTIME_${day}_${i + 1}`, { type: 'INTEGER' }],
        [`P${p}_TEMPERATURE_${day}_${i + 1}`, { type: 'FLOAT' }],
      ]).flat(),
    ),
  ),
) as unknown as ParamsetDescription;

// As the CCU stores a day: 6:00 17°, 22:00 21°, rest 17°; unused slots 1440
const monday = {
  P1_ENDTIME_MONDAY_1: 360,
  P1_TEMPERATURE_MONDAY_1: 17,
  P1_ENDTIME_MONDAY_2: 1320,
  P1_TEMPERATURE_MONDAY_2: 21,
  P1_ENDTIME_MONDAY_3: 1440,
  P1_TEMPERATURE_MONDAY_3: 17,
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [
      [`P1_ENDTIME_MONDAY_${i + 4}`, 1440],
      [`P1_TEMPERATURE_MONDAY_${i + 4}`, 17],
    ]).flat(),
  ),
};

describe('week profile', () => {
  it('finds the profiles and slots of a description', () => {
    expect(profileLayout(description)).toEqual({ profiles: 2, slots: 13 });
    expect(profileLayout({})).toEqual({ profiles: 0, slots: 0 });
  });

  it('reads the used slots of a day', () => {
    expect(readDay(monday, 1, 'MONDAY', 13)).toEqual([
      { end: 360, temperature: 17 },
      { end: 1320, temperature: 21 },
      { end: 1440, temperature: 17 },
    ]);
    // Missing values: a whole day at a safe temperature
    expect(readDay({}, 1, 'TUESDAY', 13)).toEqual([{ end: 1440, temperature: 17 }]);
  });

  it('writes a day back with all slots, unused ones at 24:00', () => {
    const values = writeDay(1, 'MONDAY', readDay(monday, 1, 'MONDAY', 13), 13);
    expect(values).toEqual(monday);
  });

  it('only sends what changed', () => {
    const week = readWeek(monday, 1, 13);
    week.MONDAY = setSlotTemperature(week.MONDAY, 1, 21.5);
    const changes = changedValues(monday, 1, week, 13);
    expect(changes.P1_TEMPERATURE_MONDAY_2).toBe(21.5);
    expect(changes.P1_ENDTIME_MONDAY_1).toBeUndefined();
  });

  it('edits slots within their neighbours, in 15 minute steps', () => {
    const day = readDay(monday, 1, 'MONDAY', 13);
    expect(setSlotEnd(day, 0, 371)[0].end).toBe(375);
    expect(setSlotEnd(day, 0, 2000)[0].end).toBe(1305);
    // The last slot always ends at midnight
    expect(setSlotEnd(day, 2, 600)).toBe(day);
    expect(setSlotTemperature(day, 0, 40)[0].temperature).toBe(30);
    expect(setSlotTemperature(day, 0, 18.3)[0].temperature).toBe(18.5);
  });

  it('splits and removes slots', () => {
    const day = readDay(monday, 1, 'MONDAY', 13);
    const split = splitSlot(day, 1, 13);
    expect(split.map((s) => s.end)).toEqual([360, 840, 1320, 1440]);
    expect(splitSlot(day, 1, 3)).toBe(day);
    expect(removeSlot(split, 3).map((s) => s.end)).toEqual([360, 840, 1440]);
    expect(removeSlot(day, 0).map((s) => s.end)).toEqual([1320, 1440]);
  });

  it('tells the temperature now and the next change', () => {
    const day = readDay(monday, 1, 'MONDAY', 13);
    expect(temperatureAt(day, 7 * 60)).toBe(21);
    expect(nextChange(day, 7 * 60)).toEqual({ at: 1320, temperature: 17 });
    expect(nextChange(day, 23 * 60)).toBeUndefined();
  });
});
