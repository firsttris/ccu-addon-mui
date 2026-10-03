import { describe, expect, it } from 'vitest';
import {
  clockOf,
  clockOfSeconds,
  conditionKind,
  isSimpleTimeModule,
  newCondition,
  newProgram,
  newTimeModule,
  programProblems,
  secondsOfClock,
  TIMER,
  timeOfClock,
} from './programModel';

describe('programModel', () => {
  it('converts the time of a time module', () => {
    expect(clockOf('2007-01-01 19:30:00')).toBe('19:30');
    expect(timeOfClock('06:05')).toBe('2007-01-01 06:05:00');
    expect(secondsOfClock('01:30')).toBe(5400);
    // A range past midnight
    expect(clockOfSeconds(secondsOfClock('22:00') + 4 * 3600)).toBe('02:00');
  });

  it('knows which time modules the form can show', () => {
    expect(isSimpleTimeModule(newTimeModule())).toBe(true);
    expect(isSimpleTimeModule({ ...newTimeModule(), timerType: TIMER.PERIODIC })).toBe(false);
    expect(isSimpleTimeModule({ ...newTimeModule(), sunOffset: 3 })).toBe(false);
  });

  it('starts conditions like the WebUI', () => {
    expect(conditionKind(newCondition('time'))).toBe('time');
    expect(newCondition('time').trigger).toBe(13);
    expect(newCondition('device').trigger).toBe(4);
    expect(conditionKind({ ...newCondition('device'), leftType: 'N:19' })).toBe('other');
  });

  it('finds what can not be saved', () => {
    const program = newProgram();
    expect(programProblems(program)).toEqual(['name']);
    expect(programProblems({ ...program, name: 'A "B"' })).toEqual(['name']);
    const script = { ...program, name: 'P', rules: [{ ...program.rules[0], destinations: [{ ...program.rules[0].destinations[0], valueType: 'ivtString', value: 'a^b' }] }] };
    expect(programProblems(script)).toEqual(['script']);
  });
});
