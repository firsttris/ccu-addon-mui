import { describe, expect, it } from 'vitest';
import { TimeModule } from '../../types/protocol';
import {
  clockOf,
  dateOf,
  describeTimeModule,
  SUN,
  timeModeOf,
  TimeTexts,
  WORKDAY_BITS,
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

describe('describeTimeModule', () => {
  const x: TimeTexts = {
    locale: 'de',
    weekday: (i) => ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][i],
    month: (i) => ['Jan', 'Feb', 'Mär'][i] ?? `M${i + 1}`,
    t: {
      at: (c) => `um ${c}`,
      range: (a, b) => `${a}-${b}`,
      allDay: 'ganztägig',
      daytime: 'tagsüber',
      nighttime: 'nachts',
      once: (d) => `einmal ${d}`,
      every: (i) => `alle ${i}`,
      daily: 'täglich',
      everyNDays: (n) => `alle ${n} Tage`,
      workdays: 'werktags',
      weekend: 'Wochenende',
      weekly: (d) => `wöchentlich ${d}`,
      everyNWeeks: (n, d) => `alle ${n} Wochen ${d}`,
      monthlyDay: (d, n) => `am ${d}. alle ${n}`,
      monthlyNth: (nth, d, n) => `am ${nth}. ${d} alle ${n}`,
      yearlyDay: (d, mo) => `${d}. ${mo}`,
      yearlyNth: (nth, d, mo) => `${nth}. ${d} ${mo}`,
      hours: (n) => `${n}h`,
      minutes: (n) => `${n}min`,
      seconds: (n) => `${n}s`,
    },
  };
  const tm = (patch: Partial<TimeModule>): TimeModule => ({ ...newTimeModule(), time: '2007-01-01 19:30:00', ...patch });

  it('says when and how often', () => {
    expect(describeTimeModule(tm({}), x)).toBe('täglich, um 19:30');
    expect(describeTimeModule(tm({ duration: 5400 }), x)).toBe('täglich, 19:30-21:00');
    expect(describeTimeModule(tm({ time: '0', sunOffset: SUN.DAYTIME, weekdays: WORKDAY_BITS }), x)).toBe('werktags, tagsüber');
    expect(describeTimeModule(tm({ time: '0' }), x)).toBe('täglich, ganztägig');
    expect(describeTimeModule(tm({ timerType: TIMER.PERIODIC, period: 900 }), x)).toBe('alle 15min, um 19:30');
    expect(describeTimeModule(tm({ timerType: TIMER.WEEKLY, weekdays: 1 | 4, repetitionValue: 2 }), x)).toBe('alle 2 Wochen Mo, Mi, um 19:30');
    expect(describeTimeModule(tm({ timerType: TIMER.MONTHLY, weekdays: 16, period: 1, repetitionValue: 1 }), x)).toBe('am 1. Fr alle 1, um 19:30');
    expect(describeTimeModule(tm({ timerType: TIMER.YEARLY, period: 24, repetitionValue: 2 }), x)).toBe('24. Feb, um 19:30');
  });

  it('reads the dates ReGa prints', () => {
    expect(dateOf('2026-01-15 00:00:00')).toBe('2026-01-15');
    expect(dateOf('0')).toBe('');
    expect(timeModeOf(tm({ time: '0', sunOffset: SUN.NIGHTTIME }))).toBe('nighttime');
  });
});
