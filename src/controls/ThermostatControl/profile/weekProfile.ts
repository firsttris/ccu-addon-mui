import type { DatapointValue, ParamsetDescription } from '../../../types/types';

// The week profiles of a HomeMatic IP thermostat or heating group live in
// the MASTER paramset of its climate channel, as pairs per day and slot:
// P<profile>_ENDTIME_<DAY>_<slot> (minutes since midnight) and
// P<profile>_TEMPERATURE_<DAY>_<slot> (°C). A slot runs from the previous
// end time (or midnight) to its own; the slot ending at 24:00 is the last,
// the ones after it are unused.
//
// BidCos thermostats keep theirs in the device's MASTER paramset: the wall
// thermostat HM-TC-IT-WM with the same names (P1-P3, which one runs set by
// WEEK_PROGRAM_POINTER 0-2, rf_tc_it_wm-w-eu.xml), the radiator thermostat
// HM-CC-RT-DN one profile without the prefix: ENDTIME_<DAY>_<slot>,
// TEMPERATURE_<DAY>_<slot> (rf_cc_rt_dn.xml). Profile 0 stands for that
// one here.

export const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
export type Day = (typeof DAYS)[number];

export const DAY_END = 24 * 60;
export const SLOT_STEP = 15;
export const MIN_TEMPERATURE = 5;
export const MAX_TEMPERATURE = 30;

export interface Slot {
  // Minutes since midnight at which this slot ends
  end: number;
  temperature: number;
}

export type DayProfile = Slot[];
export type WeekProfile = Record<Day, DayProfile>;

const prefix = (profile: number) => (profile === 0 ? '' : `P${profile}_`);
const endName = (profile: number, day: Day, slot: number) => `${prefix(profile)}ENDTIME_${day}_${slot}`;
const temperatureName = (profile: number, day: Day, slot: number) => `${prefix(profile)}TEMPERATURE_${day}_${slot}`;

// The profiles (1, 2, ...) and slots per day a description offers.
// prefixed: false for the one profile without "P<n>_" (profile 0).
export const profileLayout = (description: ParamsetDescription | undefined) => {
  let profiles = 0;
  let slots = 0;
  let unprefixedSlots = 0;
  for (const name of Object.keys(description ?? {})) {
    const match = /^P(\d+)_ENDTIME_MONDAY_(\d+)$/.exec(name);
    if (match) {
      profiles = Math.max(profiles, Number(match[1]));
      slots = Math.max(slots, Number(match[2]));
    }
    const plain = /^ENDTIME_MONDAY_(\d+)$/.exec(name);
    if (plain) unprefixedSlots = Math.max(unprefixedSlots, Number(plain[1]));
  }
  if (profiles === 0 && unprefixedSlots > 0) {
    return { profiles: 1, slots: unprefixedSlots, prefixed: false };
  }
  return { profiles, slots, prefixed: true };
};

// The used slots of one day: up to and including the one ending at 24:00.
// Values out of order or missing end the day at the last sensible slot.
export const readDay = (
  values: Record<string, DatapointValue>,
  profile: number,
  day: Day,
  slots: number,
): DayProfile => {
  const result: DayProfile = [];
  let previous = 0;
  for (let slot = 1; slot <= slots; slot++) {
    const end = Number(values[endName(profile, day, slot)]);
    const temperature = Number(values[temperatureName(profile, day, slot)]);
    if (!Number.isFinite(end) || !Number.isFinite(temperature) || end <= previous) {
      break;
    }
    result.push({ end: Math.min(end, DAY_END), temperature });
    previous = end;
    if (end >= DAY_END) {
      break;
    }
  }
  // Always a full day, even from broken values
  if (result.length === 0) {
    return [{ end: DAY_END, temperature: 17 }];
  }
  result[result.length - 1] = { ...result[result.length - 1], end: DAY_END };
  return result;
};

export const readWeek = (values: Record<string, DatapointValue>, profile: number, slots: number): WeekProfile =>
  Object.fromEntries(DAYS.map((day) => [day, readDay(values, profile, day, slots)])) as WeekProfile;

// The parameters for one day; unused slots repeat the last one (as the
// CCU writes them)
export const writeDay = (profile: number, day: Day, daySlots: DayProfile, slots: number) => {
  const values: Record<string, number> = {};
  const last = daySlots[daySlots.length - 1];
  for (let slot = 1; slot <= slots; slot++) {
    const s = daySlots[slot - 1] ?? last;
    values[endName(profile, day, slot)] = slot <= daySlots.length ? s.end : DAY_END;
    values[temperatureName(profile, day, slot)] = s.temperature;
  }
  return values;
};

// Only the parameters that differ from the stored values
export const changedValues = (
  current: Record<string, DatapointValue>,
  profile: number,
  week: WeekProfile,
  slots: number,
) => {
  const changes: Record<string, number> = {};
  for (const day of DAYS) {
    for (const [name, value] of Object.entries(writeDay(profile, day, week[day], slots))) {
      if (Number(current[name]) !== value) {
        changes[name] = value;
      }
    }
  }
  return changes;
};

// --- Editing a day

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const roundToStep = (minutes: number) => Math.round(minutes / SLOT_STEP) * SLOT_STEP;

// Moves the end of a slot (not the last), keeping the slots in order
export const setSlotEnd = (day: DayProfile, index: number, end: number): DayProfile => {
  if (index >= day.length - 1) return day;
  const start = index === 0 ? 0 : day[index - 1].end;
  const next = day[index + 1].end;
  const clamped = clamp(roundToStep(end), start + SLOT_STEP, next - SLOT_STEP);
  return day.map((slot, i) => (i === index ? { ...slot, end: clamped } : slot));
};

export const setSlotTemperature = (day: DayProfile, index: number, temperature: number): DayProfile =>
  day.map((slot, i) =>
    i === index
      ? { ...slot, temperature: clamp(Math.round(temperature * 2) / 2, MIN_TEMPERATURE, MAX_TEMPERATURE) }
      : slot,
  );

// Splits a slot in the middle (if there is room and a slot to spare)
export const splitSlot = (day: DayProfile, index: number, maxSlots: number): DayProfile => {
  if (day.length >= maxSlots) return day;
  const start = index === 0 ? 0 : day[index - 1].end;
  const end = day[index].end;
  const middle = roundToStep(start + (end - start) / 2);
  if (middle - start < SLOT_STEP || end - middle < SLOT_STEP) return day;
  return [...day.slice(0, index), { end: middle, temperature: day[index].temperature }, ...day.slice(index)];
};

// Removes a slot; the previous one (or, for the first, the next one)
// takes over its time
export const removeSlot = (day: DayProfile, index: number): DayProfile => {
  if (day.length <= 1) return day;
  if (index === day.length - 1) {
    const result = day.slice(0, -1);
    result[result.length - 1] = { ...result[result.length - 1], end: DAY_END };
    return result;
  }
  return day.filter((_, i) => i !== index);
};

// The temperature at a time of day (minutes), e.g. for "now"
export const temperatureAt = (day: DayProfile, minutes: number) =>
  (day.find((slot) => minutes < slot.end) ?? day[day.length - 1]).temperature;

// The next change after a time of day, if any today
export const nextChange = (day: DayProfile, minutes: number) => {
  const index = day.findIndex((slot) => minutes < slot.end);
  return index >= 0 && index < day.length - 1
    ? { at: day[index].end, temperature: day[index + 1].temperature }
    : undefined;
};

export const formatMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
