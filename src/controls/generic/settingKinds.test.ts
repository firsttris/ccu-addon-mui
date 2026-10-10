import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getLocale, overwriteGetLocale } from '../../paraglide/runtime';
import type { ParameterDescription } from '../../types/types';
import {
  combineSettings,
  controlOf,
  enumLabel,
  formatDuration,
  isPercentSetting,
  stepOf,
  timeOfDayStep,
  unitLabel,
  unitSeconds,
} from './settingKinds';

const p = (over: Partial<ParameterDescription>): ParameterDescription => ({
  type: 'INTEGER',
  operations: 3,
  flags: 1,
  tabOrder: 0,
  ...over,
});

describe('device settings', () => {
  // As on a German CCU
  const before = getLocale;
  beforeAll(() => overwriteGetLocale(() => 'de'));
  afterAll(() => overwriteGetLocale(before));

  it('pairs value and unit of a time', () => {
    const settings = combineSettings([
      ['EVENT_DELAY_VALUE', p({ min: 0, max: 63 })],
      ['EVENT_DELAY_UNIT', p({ type: 'ENUM', valueList: ['100MS', 'S', 'M', 'H'] })],
      ['ON_TIME_FACTOR', p({ min: 0, max: 31 })],
      ['ON_TIME_BASE', p({ type: 'ENUM', valueList: ['BASE_100_MS', 'BASE_1_S'] })],
      ['OTHER_VALUE', p({})],
    ]);
    expect(settings.map((s) => [s.kind, s.name])).toEqual([
      ['duration', 'EVENT_DELAY'],
      ['duration', 'ON_TIME'],
      ['single', 'OTHER_VALUE'],
    ]);
  });
  it('reads the CCU time units', () => {
    expect(unitSeconds('100MS')).toBe(0.1);
    expect(unitSeconds('10MS')).toBe(0.01);
    expect(unitSeconds('M')).toBe(60);
    expect(unitSeconds('10M')).toBe(600);
    expect(unitSeconds('H')).toBe(3600);
    expect(unitSeconds('BASE_5_S')).toBe(5);
    expect(unitSeconds('BASE_1_D')).toBe(86400);
    expect(unitSeconds('LOW')).toBeUndefined();
    expect(unitLabel('100MS')).toBe('100 ms');
    expect(unitLabel('M')).toBe('min');
    expect(formatDuration(0.5)).toBe('0,5 s');
    expect(formatDuration(150)).toBe('2 min 30 s');
    expect(formatDuration(3600 * 25)).toBe('1 Tag 1 h');
  });
  it('picks the control for a setting', () => {
    expect(controlOf('X', p({ type: 'BOOL' }), true)).toBe('switch');
    expect(controlOf('X', p({ type: 'BOOL' }), false)).toBe('readonly');
    expect(controlOf('OUTPUT_SWAP', p({ type: 'ENUM', valueList: ['NOT_SWAPPED', 'SWAPPED'] }), true)).toBe(
      'segmented',
    );
    expect(controlOf('X', p({ type: 'ENUM', valueList: ['A', 'B', 'C', 'D'] }), true)).toBe('choice');
    expect(controlOf('VALVE_OFFSET', p({ type: 'FLOAT', min: 0, max: 1, unit: '100%' }), true)).toBe('percent');
    expect(controlOf('VALVE_MAXIMUM_POSITION', p({ type: 'FLOAT', min: 0, max: 1 }), true)).toBe('percent');
    expect(controlOf('BOOST_POSITION', p({ min: 0, max: 100 }), true)).toBe('percent');
    expect(controlOf('DST_START_TIME', p({ min: 0, max: 1425 }), true)).toBe('timeOfDay');
    expect(controlOf('DECALCIFICATION_TIME', p({ min: 0, max: 47 }), true)).toBe('timeOfDay');
    expect(controlOf('DST_START_MONTH', p({ min: 1, max: 12 }), true)).toBe('month');
    expect(controlOf('TEMPERATURE_COMFORT', p({ type: 'FLOAT', min: 15, max: 30, unit: '°C' }), true)).toBe('stepper');
    expect(controlOf('CYCLIC_INFO_MSG_OVERDUE_THRESHOLD', p({ min: 0, max: 2147483647 }), true)).toBe('number');
    expect(isPercentSetting('LATITUDE', p({ type: 'FLOAT', min: -90, max: 90 }))).toBe(false);
    expect(timeOfDayStep('BOOST_TIME_PERIOD', p({ min: 0, max: 30 }))).toBeUndefined();
  });
  it('steps temperatures in half degrees', () => {
    expect(stepOf('TEMPERATURE_COMFORT', p({ type: 'FLOAT', min: 15, max: 30, unit: '°C' }))).toBe(0.5);
    expect(stepOf('TWO_POINT_HYSTERESIS', p({ type: 'FLOAT', min: 0, max: 2, unit: '°C' }))).toBe(0.1);
    expect(stepOf('LOW_BAT_LIMIT', p({ type: 'FLOAT', min: 0, max: 25.2, unit: 'V' }))).toBe(0.1);
    expect(stepOf('X', p({ min: 0, max: 255 }))).toBe(1);
  });
  it('names the choices readably', () => {
    expect(enumLabel('SET_TEMPERATURE_CHANGE_ONLY_BY_CCU')).toBe('Nur von der Zentrale');
    expect(enumLabel('SATURDAY')).toBe('Samstag');
    expect(enumLabel('1S')).toBe('1 s');
    expect(enumLabel('SOMETHING_NEW')).toBe('Something new');
  });
});
