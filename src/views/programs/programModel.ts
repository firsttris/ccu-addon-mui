import {
  ProgramBranch,
  ProgramCondition,
  ProgramDefinition,
  ProgramDestination,
  ProgramRule,
  TimeModule,
} from '../../types/protocol';
import { ParameterDescription, Sysvar } from '../../types/types';

// Helpers for the program editor. The model is the one the server reads and
// writes (rega/programs.go), close to ReGa's: condition kinds and value
// types are ReGa constant names, see the WebUI's sico.fn and dest.fn.

export const ID_ERROR = 65535;

// ConditionType (sico.inc): how a value is compared
export const COMPARE = {
  EQUAL: 1,
  NUMBER_EQUAL: 5,
  RANGE: 6,
  GREATER: 8,
  GREATER_EQUAL: 9,
  LESS: 10,
  LESS_EQUAL: 11,
} as const;
// ConditionType2: when the condition triggers the program
export const TRIGGER = { CHANGE: 4, UPDATE: 13, CHECK: 15 } as const;
// TimerType of a time module (timemodule.htm)
export const TIMER = { ONCE: 8, PERIODIC: 4, DAILY: 9, WEEKLY: 5, MONTHLY: 6, YEARLY: 7 } as const;
// Weekdays of a time module, Monday first
export const WEEKDAYS = [1, 2, 4, 8, 16, 32, 64];

export type ConditionKind = 'device' | 'sysvar' | 'time' | 'other';
export type DestinationKind = 'device' | 'sysvar' | 'script' | 'other';

export const conditionKind = (c: ProgramCondition): ConditionKind => {
  if (c.leftType === 'ivtObjectId') return 'device';
  if (c.leftType === 'ivtSystemId') return 'sysvar';
  if (c.leftType === 'ivtCurrentDate' && c.time) return 'time';
  return 'other';
};

export const destinationKind = (d: ProgramDestination): DestinationKind => {
  if (d.param === 'ivtObjectId') return 'device';
  if (d.param === 'ivtSystemId') return 'sysvar';
  if (d.param === 'ivtString') return 'script';
  return 'other';
};

// The value type a datapoint's or system variable's values are written with
export const valueTypeOf = (parameter?: Pick<ParameterDescription, 'type'>) => {
  switch (parameter?.type) {
    case 'BOOL':
    case 'ACTION':
      return 'ivtBinary';
    case 'FLOAT':
      return 'ivtFloat';
    case 'STRING':
      return 'ivtString';
    default:
      return 'ivtInteger';
  }
};

export const sysvarValueType = (sysvar?: Sysvar) => {
  switch (sysvar?.kind) {
    case 'bool':
    case 'alarm':
      return 'ivtBinary';
    case 'number':
      return 'ivtFloat';
    case 'string':
      return 'ivtString';
    default:
      return 'ivtInteger';
  }
};

// --- New parts, with the WebUI's defaults

// Today on the wall clock as "YYYY-MM-DD" (toISOString would be UTC: until
// 2 am in Germany that is yesterday)
export const today = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const newTimeModule = (): TimeModule => ({
  id: 0,
  changed: true,
  timerType: TIMER.DAILY,
  time: '2007-01-01 07:00:00',
  duration: 0,
  sunOffset: 0,
  period: 0,
  weekdays: 0,
  repetitionValue: 1,
  begin: today(),
  end: '0',
  repetitionCount: 0,
  repeatTime: '',
});

export const newCondition = (kind: ConditionKind): ProgramCondition => {
  const base = { leftValue: 0, channel: 0, value2Type: 'ivtEmpty', value2: '0' };
  if (kind === 'time') {
    return {
      ...base,
      leftType: 'ivtCurrentDate',
      leftValue: ID_ERROR,
      compare: COMPARE.EQUAL,
      trigger: TRIGGER.UPDATE,
      value1Type: 'ivtObjectId',
      value1: '0',
      time: newTimeModule(),
    };
  }
  return {
    ...base,
    leftType: kind === 'sysvar' ? 'ivtSystemId' : 'ivtObjectId',
    compare: COMPARE.EQUAL,
    trigger: TRIGGER.CHANGE,
    value1Type: 'ivtBinary',
    value1: '1',
  };
};

export const newDestination = (kind: DestinationKind): ProgramDestination => ({
  param: kind === 'sysvar' ? 'ivtSystemId' : kind === 'script' ? 'ivtString' : 'ivtObjectId',
  channel: 0,
  datapointId: 0,
  valueType: kind === 'script' ? 'ivtString' : 'ivtBinary',
  value: kind === 'script' ? '' : '1',
  delay: 0,
});

export const newBranch = (): ProgramBranch => ({ breakOnRestart: false, destinations: [] });

export const newRule = (): ProgramRule => ({ groupOperator: 'or', groups: [[newCondition('device')]], ...newBranch() });

export const newProgram = (): ProgramDefinition => ({
  id: 0,
  name: '',
  description: '',
  active: true,
  rules: [{ ...newRule(), destinations: [newDestination('device')] }],
});

// --- Times

// "2007-01-01 HH:MM:SS" ⇄ "HH:MM"
export const clockOf = (time: string) => /(\d{2}):(\d{2})/.exec(time)?.slice(1, 3).join(':') ?? '00:00';
export const timeOfClock = (clock: string) => `2007-01-01 ${clock}:00`;

export const secondsOfClock = (clock: string) => {
  const [h, m] = clock.split(':').map(Number);
  return (h || 0) * 3600 + (m || 0) * 60;
};
export const clockOfSeconds = (seconds: number) => {
  const s = ((seconds % 86400) + 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;
};

// Time modules the editor shows as a form: daily or weekly at a time or
// during a range of the day. Others (periodic, monthly, ...) stay as set
// in the CCU's web interface.
export const isSimpleTimeModule = (t: TimeModule) =>
  (t.timerType === TIMER.DAILY || t.timerType === TIMER.WEEKLY) && t.sunOffset === 0 && t.repetitionValue <= 1;

// Validation before saving: what the editor can't write
export const programProblems = (p: ProgramDefinition) => {
  const problems: string[] = [];
  if (p.name.trim() === '') problems.push('name');
  if (/["\\\r\n\t]/.test(p.name)) problems.push('name');
  if (p.description.includes('^')) problems.push('description');
  const destinations = [...p.rules.flatMap((r) => r.destinations), ...(p.else?.destinations ?? [])];
  if (destinations.some((d) => d.valueType === 'ivtString' && d.value.includes('^'))) problems.push('script');
  return problems;
};

// --- Time modules in full (the WebUI's timemodule.htm)

export const SUN = { NONE: 0, DAYTIME: 3, NIGHTTIME: 6 } as const;
export const WORKDAY_BITS = 31;
export const WEEKEND_BITS = 96;

// What the time part of a module is
export type TimeMode = 'point' | 'range' | 'allDay' | 'daytime' | 'nighttime';

export const timeModeOf = (t: TimeModule): TimeMode => {
  if (t.sunOffset === SUN.DAYTIME) return 'daytime';
  if (t.sunOffset === SUN.NIGHTTIME) return 'nighttime';
  if (t.duration > 0) return 'range';
  if (!/\d{2}:\d{2}/.test(t.time)) return 'allDay';
  return 'point';
};

// "YYYY-MM-DD" from what ReGa prints ("2026-01-15 00:00:00") or ""
export const dateOf = (text: string) => (/^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '');

const pad2 = (n: number) => String(n).padStart(2, '0');
const formatDate = (iso: string, locale: string) => {
  const [y, mo, d] = iso.split('-').map(Number);
  return y ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(y, mo - 1, d)) : iso;
};

export interface TimeTexts {
  weekday: (index: number, style: 'short' | 'long') => string;
  month: (index: number) => string;
  locale: string;
  t: {
    at: (clock: string) => string;
    range: (from: string, to: string) => string;
    allDay: string;
    daytime: string;
    nighttime: string;
    once: (date: string) => string;
    every: (interval: string) => string;
    daily: string;
    everyNDays: (n: number) => string;
    workdays: string;
    weekend: string;
    weekly: (days: string) => string;
    everyNWeeks: (n: number, days: string) => string;
    monthlyDay: (day: number, n: number) => string;
    monthlyNth: (nth: number, day: string, n: number) => string;
    yearlyDay: (day: number, month: string) => string;
    yearlyNth: (nth: number, day: string, month: string) => string;
    hours: (n: number) => string;
    minutes: (n: number) => string;
    seconds: (n: number) => string;
  };
}

// The weekday index (Monday 0) of a single-bit mask
const bitIndex = (mask: number) => WEEKDAYS.findIndex((bit) => bit === mask);

// A time module in words, e.g. "täglich, um 19:30" or "tagsüber, werktags"
export const describeTimeModule = (tm: TimeModule, x: TimeTexts) => {
  const mode = timeModeOf(tm);
  const start = clockOf(tm.time);
  const time =
    mode === 'point'
      ? x.t.at(start)
      : mode === 'range'
        ? x.t.range(start, clockOfSeconds(secondsOfClock(start) + tm.duration))
        : mode === 'allDay'
          ? x.t.allDay
          : mode === 'daytime'
            ? x.t.daytime
            : x.t.nighttime;
  const days = (mask: number) =>
    WEEKDAYS.map((bit, i) => ((mask & bit) !== 0 ? x.weekday(i, 'short') : null))
      .filter(Boolean)
      .join(', ');
  let pattern = '';
  switch (tm.timerType) {
    case TIMER.ONCE:
      pattern = x.t.once(formatDate(dateOf(tm.repeatTime), x.locale));
      break;
    case TIMER.PERIODIC: {
      const p = tm.period;
      pattern = x.t.every(p % 3600 === 0 ? x.t.hours(p / 3600) : p % 60 === 0 ? x.t.minutes(p / 60) : x.t.seconds(p));
      break;
    }
    case TIMER.DAILY:
      pattern =
        tm.weekdays === WORKDAY_BITS
          ? x.t.workdays
          : tm.weekdays === WEEKEND_BITS
            ? x.t.weekend
            : tm.repetitionValue > 1
              ? x.t.everyNDays(tm.repetitionValue)
              : x.t.daily;
      break;
    case TIMER.WEEKLY:
      pattern =
        tm.repetitionValue > 1 ? x.t.everyNWeeks(tm.repetitionValue, days(tm.weekdays)) : x.t.weekly(days(tm.weekdays));
      break;
    case TIMER.MONTHLY:
      pattern =
        tm.weekdays > 0
          ? x.t.monthlyNth(tm.period, x.weekday(bitIndex(tm.weekdays), 'long'), Math.max(1, tm.repetitionValue))
          : x.t.monthlyDay(tm.period, Math.max(1, tm.repetitionValue));
      break;
    case TIMER.YEARLY:
      pattern =
        tm.weekdays > 0
          ? x.t.yearlyNth(tm.period, x.weekday(bitIndex(tm.weekdays), 'long'), x.month(tm.repetitionValue - 1))
          : x.t.yearlyDay(tm.period, x.month(tm.repetitionValue - 1));
      break;
  }
  return [pattern, time].filter(Boolean).join(', ');
};

export { pad2 };
