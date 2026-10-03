import { DatapointValue, ParamsetDescription } from '../../types/types';

// The direct link profiles of the WebUI ("easymodes"), imported from
// OpenCCU-Base by scripts/import-link-profiles.mjs. A profile sets all
// parameters of a link at once; a few of them stay adjustable (fields).

// A fixed value, accepted values (the first is written) or a range
export type ProfileValue = number[] | { default: number; min: number; max: number };

export interface ProfileField {
  // time: an HmIP <NAME>_BASE/<NAME>_FACTOR pair; value: the parameters
  // named, all set to the same value
  kind: 'time' | 'value';
  params: string[];
  label: Record<string, string>;
}

export interface LinkProfile {
  id: number;
  name: Record<string, string>;
  description: Record<string, string>;
  values: Record<string, ProfileValue>;
  fields: ProfileField[];
  // Device types (of the sender) the profile is limited to or not for
  whitelist?: string[];
  blacklist?: string[];
}

// By receiver channel type, then sender channel type
export type ProfileTable = Record<string, Record<string, LinkProfile[]>>;

// Loaded with the link page only (about 50 kB compressed)
export const loadProfileTable = async () => (await import('./linkProfiles.json')).default as unknown as ProfileTable;

export const profilesFor = (table: ProfileTable, receiverType: string, senderType: string, peerType?: string) =>
  (table[receiverType]?.[senderType] ?? []).filter(
    (profile) =>
      !peerType ||
      ((!profile.whitelist || profile.whitelist.includes(peerType)) && !profile.blacklist?.includes(peerType)),
  );

const isRange = (value: ProfileValue): value is { default: number; min: number; max: number } => !Array.isArray(value);

const numeric = (value: DatapointValue | undefined) => (typeof value === 'boolean' ? Number(value) : Number(value));

const accepts = (expected: ProfileValue, value: DatapointValue | undefined) => {
  const n = numeric(value);
  if (Number.isNaN(n)) return false;
  return isRange(expected) ? n >= expected.min && n <= expected.max : expected.some((v) => Math.abs(v - n) < 1e-6);
};

// The profile a link's values fit, 0 for none ("expert"), as the WebUI's
// get_cur_profile2 (ic_common.tcl): every parameter the link has must be
// one of the profile's values or within its range.
export const detectProfile = (profiles: LinkProfile[], values: Record<string, DatapointValue>) =>
  profiles.find((profile) =>
    Object.entries(profile.values).every(([name, expected]) => !(name in values) || accepts(expected, values[name])),
  )?.id ?? 0;

const typed = (description: ParamsetDescription, name: string, value: number): DatapointValue =>
  description[name]?.type === 'BOOL' ? value !== 0 : value;

// The values to write for a profile, as ic_common.tcl does: the first
// accepted value (or the range's default) of every parameter the link has.
// When the link already uses the profile, its adjustable values stay.
export const profileValues = (
  profile: LinkProfile,
  description: ParamsetDescription,
  current: Record<string, DatapointValue>,
  keepCurrent: boolean,
): Record<string, DatapointValue> => {
  const out: Record<string, DatapointValue> = {};
  for (const [name, expected] of Object.entries(profile.values)) {
    if (!(name in description)) continue;
    if (keepCurrent && name in current && accepts(expected, current[name])) {
      out[name] = current[name];
      continue;
    }
    out[name] = typed(description, name, isRange(expected) ? expected.default : expected[0]);
  }
  return out;
};

// --- Times

// HmIP: <NAME>_BASE (unit) and <NAME>_FACTOR (0..31), as the WebUI's
// TIMEBASE_LONG options (options.tcl); base 7, factor 31 is "permanent"
export const TIME_BASES = [0.1, 1, 5, 10, 60, 300, 600, 3600];
export const PERMANENT = Infinity;

export const decodeHmipTime = (base: number, factor: number) =>
  base === 7 && factor === 31 ? PERMANENT : Math.round(TIME_BASES[base] * factor * 10) / 10;

export const encodeHmipTime = (seconds: number): { base: number; factor: number } => {
  if (seconds === PERMANENT) return { base: 7, factor: 31 };
  if (seconds <= 0) return { base: 0, factor: 0 };
  // The finest unit that reaches the time, rounded to it
  const base = TIME_BASES.findIndex((unit) => seconds / unit <= 31);
  if (base === -1) return { base: 7, factor: 30 };
  return { base, factor: Math.max(1, Math.round(seconds / TIME_BASES[base])) };
};

// BidCos: seconds as a float; 111600 (31 hours) and more is "permanent"
export const BIDCOS_PERMANENT = 111600;

// Choices for times, as the WebUI's time selector (hmip_helper.tcl)
export const TIME_PRESETS = [0, 0.1, 0.5, 1, 2, 3, 5, 10, 30, 60, 120, 300, 600, 1800, 3600, 7200, 10800, 18000, 28800, 43200, 86400, PERMANENT];
