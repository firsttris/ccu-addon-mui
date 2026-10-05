import { DatapointValue, ParamsetDescription } from '../../types/types';
import { parameterLabel } from '../generic/parameters';
import { enumLabel } from '../generic/settingKinds';

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
  // The choices of a value, by value, as the WebUI names them
  options?: Record<string, Record<string, string>>;
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

// One file per receiver type, loaded when a link with such a receiver is
// shown (all of them are about 4 MB)
const files = import.meta.glob<{ default: Record<string, LinkProfile[]> }>('./profiles/*.json');

export const loadProfileTable = async (receiverType: string): Promise<ProfileTable> => {
  const load = files[`./profiles/${receiverType}.json`];
  return load ? { [receiverType]: (await load()).default } : {};
};

// The table a light receiver's profiles are in, as the WebUI's
// linkHmIP_UNIVERSAL_LIGHT_RECEIVER.tcl picks it: by the HmIP-RGBW's
// DEVICE_OPERATION_MODE (channel 0), the HmIP-DRG-DALI channel's
// UNIVERSAL_LIGHT_MAX_CAPABILITIES, or HmIP-LSC. Other receivers keep their
// type. undefined while the mode it depends on isn't known yet.
export const receiverKey = (
  receiverType: string,
  receiverDeviceType: string | undefined,
  { deviceOperationMode, maxCapabilities }: { deviceOperationMode?: number; maxCapabilities?: number },
) => {
  if (receiverType !== 'UNIVERSAL_LIGHT_RECEIVER') return receiverType;
  switch (receiverDeviceType) {
    case 'HmIP-RGBW':
      if (deviceOperationMode === undefined) return undefined;
      // 0 RGBW, 1 RGB, 2 tunable white, 3 PWM
      return [
        'UNIVERSAL_LIGHT_RECEIVER_RGB(W)',
        'UNIVERSAL_LIGHT_RECEIVER_RGB(W)',
        'UNIVERSAL_LIGHT_RECEIVER_TW',
        'UNIVERSAL_LIGHT_RECEIVER_PWM',
      ][deviceOperationMode];
    case 'HmIP-DRG-DALI':
      if (maxCapabilities === undefined) return undefined;
      // 0 switch, 1 dimmer, 2 tunable white, 3/4 RGB + tunable white
      return [
        'SWITCH_VIRTUAL_RECEIVER',
        'UNIVERSAL_LIGHT_RECEIVER_PWM',
        'UNIVERSAL_LIGHT_RECEIVER_TW',
        'UNIVERSAL_LIGHT_RECEIVER_RGBW_DALI',
        'UNIVERSAL_LIGHT_RECEIVER_RGBW_DALI',
      ][maxCapabilities];
    case 'HmIP-LSC':
      return 'UNIVERSAL_LIGHT_RECEIVER_LSC';
  }
  return receiverType;
};

// Senders a light receiver's profiles know under another type
// (linkHmIP_UNIVERSAL_LIGHT_RECEIVER.tcl)
const lightSenders: Record<string, string> = {
  LEVEL_COMMAND_TRANSMITTER_CO2: 'COND_SWITCH_TRANSMITTER',
  LEVEL_COMMAND_TRANSMITTER_HUMIDITY: 'COND_SWITCH_TRANSMITTER_HUMIDITY',
  LEVEL_COMMAND_TRANSMITTER_TEMPERATURE: 'COND_SWITCH_TRANSMITTER_TEMPERATURE',
};

// Senders whose profiles the WebUI picks by the sender channel: an input
// by its CHANNEL_OPERATION_MODE (easymodes/<RECEIVER>/MULTI_MODE_INPUT_TRANSMITTER.tcl
// sources MULTI_MODE_INPUT_TRANSMITTER_$mode.tcl, _1_FDC for an HmIP-FDC
// receiver in mode 1), a rotary control by its channel index
// (ROTARY_CONTROL_TRANSCEIVER.tcl: ROTARY_CONTROL_TRANSCEIVER_$index.tcl).
// Returns the key of the receiver's table to use.
export const senderKey = (
  table: ProfileTable,
  receiverType: string,
  senderType: string,
  {
    senderAddress,
    operationMode,
    receiverDeviceType,
    senderDeviceType,
  }: { senderAddress?: string; operationMode?: number; receiverDeviceType?: string; senderDeviceType?: string },
) => {
  const senders = table[receiverType] ?? {};
  const candidates: string[] = [];
  if (receiverType.startsWith('UNIVERSAL_LIGHT_RECEIVER_')) {
    if (lightSenders[senderType]) candidates.push(lightSenders[senderType]);
    // A key of the HmIP-MOD-RC8 used as switch or contact
    if (senderType === 'KEY_TRANSCEIVER' && senderDeviceType === 'HmIP-MOD-RC8') {
      if (operationMode === 2) candidates.push('SWITCH_TRANSCEIVER');
      if (operationMode === 3) candidates.push('SHUTTER_CONTACT');
    }
  }
  if (senderType === 'MULTI_MODE_INPUT_TRANSMITTER' && operationMode !== undefined) {
    if (receiverDeviceType === 'HmIP-FDC' && operationMode === 1) candidates.push(`${senderType}_1_FDC`);
    candidates.push(`${senderType}_${operationMode}`);
  }
  if (senderType === 'ROTARY_CONTROL_TRANSCEIVER' && senderAddress?.includes(':')) {
    candidates.push(`${senderType}_${senderAddress.split(':')[1]}`);
  }
  return candidates.find((key) => key in senders) ?? senderType;
};

export const profilesFor = (table: ProfileTable, receiverType: string, senderType: string, peerType?: string) =>
  (table[receiverType]?.[senderType] ?? []).filter(
    (profile) => !peerType || ((!profile.whitelist || profile.whitelist.includes(peerType)) && !profile.blacklist?.includes(peerType)),
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
export const TIME_PRESETS = [
  0,
  0.1,
  0.5,
  1,
  2,
  3,
  5,
  10,
  30,
  60,
  120,
  300,
  600,
  1800,
  3600,
  7200,
  10800,
  18000,
  28800,
  43200,
  86400,
  PERMANENT,
];

// Readable names of link parameters and their choices: as the WebUI's
// profiles for this pair label them, else the translations and the
// catalog of settings; the long-press ones marked as such
export const linkParameterNames = (profiles: LinkProfile[], lang: string, t: (key: string) => string, long: string) => {
  const labels = new Map<string, string>();
  const choices = new Map<string, Record<string, Record<string, string>>>();
  for (const field of profiles.flatMap((p) => p.fields)) {
    const label = field.label[lang] || field.label.de;
    for (const param of field.params) {
      if (label && !labels.has(param)) labels.set(param, label);
      if (field.options && !choices.has(param)) choices.set(param, field.options);
    }
  }
  return {
    nameOf: (name: string) => {
      const base = name.replace(/^(SHORT|LONG)_/, '');
      const translated = t(name);
      const label = labels.get(name) ?? (translated !== name ? translated : (labels.get(`SHORT_${base}`) ?? parameterLabel(base)));
      return name.startsWith('LONG_') ? `${label} (${long})` : label;
    },
    optionOf: (name: string, index: number, option: string) => {
      const base = name.replace(/^(SHORT|LONG)_/, '');
      const own = (choices.get(name) ?? choices.get(`SHORT_${base}`))?.[String(index)];
      return own ? own[lang] || own.de : enumLabel(option);
    },
  };
};
