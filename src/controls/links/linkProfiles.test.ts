import { describe, expect, it } from 'vitest';
import { ParamsetDescription } from '../../types/types';
import {
  decodeHmipTime,
  detectProfile,
  encodeHmipTime,
  LinkProfile,
  linkParameterNames,
  PERMANENT,
  profilesFor,
  profileValues,
  receiverKey,
  senderKey,
} from './linkProfiles';
import blindReceiver from './profiles/BLIND_VIRTUAL_RECEIVER.json';
import floorHeating from './profiles/CLIMATECONTROL_FLOOR_TRANSCEIVER.json';
import switchReceiver from './profiles/SWITCH_VIRTUAL_RECEIVER.json';

const profile = (id: number, values: LinkProfile['values'], extra: Partial<LinkProfile> = {}): LinkProfile => ({
  id,
  name: { de: `P${id}` },
  description: { de: '' },
  values,
  fields: [],
  ...extra,
});

const on = profile(1, {
  SHORT_PROFILE_ACTION_TYPE: [1],
  SHORT_JT_ON: [1, 3],
  SHORT_ON_TIME_BASE: { default: 7, min: 0, max: 7 },
});
const off = profile(2, { SHORT_PROFILE_ACTION_TYPE: [1], SHORT_JT_ON: [4, 6] });
const description = {
  SHORT_PROFILE_ACTION_TYPE: { type: 'INTEGER' },
  SHORT_JT_ON: { type: 'INTEGER' },
  SHORT_ON_TIME_BASE: { type: 'INTEGER' },
} as unknown as ParamsetDescription;

describe('linkProfiles', () => {
  it("imports jump tables set from the file's constants ($ON_DELAY, [subst {...}])", () => {
    // BLIND_VIRTUAL_RECEIVER/MULTI_MODE_INPUT_TRANSMITTER_3.tcl: set ON_DELAY 1, OFF_DELAY 4, REFOFF 8, ON 3
    const senders = blindReceiver as unknown as Record<string, LinkProfile[]>;
    const upDown = senders.MULTI_MODE_INPUT_TRANSMITTER_3.find((p) => p.id === 3);
    expect(upDown?.values.LONG_JT_OFF).toEqual([1]);
    expect(upDown?.values.LONG_JT_OFFDELAY).toEqual([4, 8, 3]);
  });

  it("picks the light receiver's table by device and mode, as linkHmIP_UNIVERSAL_LIGHT_RECEIVER.tcl", () => {
    expect(receiverKey('SWITCH_VIRTUAL_RECEIVER', 'HmIP-BSM', {})).toBe('SWITCH_VIRTUAL_RECEIVER');
    expect(receiverKey('UNIVERSAL_LIGHT_RECEIVER', 'HmIP-RGBW', {})).toBeUndefined();
    expect(receiverKey('UNIVERSAL_LIGHT_RECEIVER', 'HmIP-RGBW', { deviceOperationMode: 1 })).toBe(
      'UNIVERSAL_LIGHT_RECEIVER_RGB(W)',
    );
    expect(receiverKey('UNIVERSAL_LIGHT_RECEIVER', 'HmIP-RGBW', { deviceOperationMode: 2 })).toBe(
      'UNIVERSAL_LIGHT_RECEIVER_TW',
    );
    expect(receiverKey('UNIVERSAL_LIGHT_RECEIVER', 'HmIP-RGBW', { deviceOperationMode: 3 })).toBe(
      'UNIVERSAL_LIGHT_RECEIVER_PWM',
    );
    expect(receiverKey('UNIVERSAL_LIGHT_RECEIVER', 'HmIP-DRG-DALI', { maxCapabilities: 0 })).toBe(
      'SWITCH_VIRTUAL_RECEIVER',
    );
    expect(receiverKey('UNIVERSAL_LIGHT_RECEIVER', 'HmIP-DRG-DALI', { maxCapabilities: 4 })).toBe(
      'UNIVERSAL_LIGHT_RECEIVER_RGBW_DALI',
    );
    expect(receiverKey('UNIVERSAL_LIGHT_RECEIVER', 'HmIP-LSC', {})).toBe('UNIVERSAL_LIGHT_RECEIVER_LSC');
    // Light senders under the names the light tables use
    const lights = { UNIVERSAL_LIGHT_RECEIVER_TW: { COND_SWITCH_TRANSMITTER_HUMIDITY: [], SWITCH_TRANSCEIVER: [] } };
    expect(senderKey(lights, 'UNIVERSAL_LIGHT_RECEIVER_TW', 'LEVEL_COMMAND_TRANSMITTER_HUMIDITY', {})).toBe(
      'COND_SWITCH_TRANSMITTER_HUMIDITY',
    );
    expect(
      senderKey(lights, 'UNIVERSAL_LIGHT_RECEIVER_TW', 'KEY_TRANSCEIVER', {
        senderDeviceType: 'HmIP-MOD-RC8',
        operationMode: 2,
      }),
    ).toBe('SWITCH_TRANSCEIVER');
  });

  it('picks the sender profiles by operation mode and channel, as the WebUI', () => {
    const table = {
      SWITCH_VIRTUAL_RECEIVER: {
        MULTI_MODE_INPUT_TRANSMITTER_1: [],
        MULTI_MODE_INPUT_TRANSMITTER_1_FDC: [],
        MULTI_MODE_INPUT_TRANSMITTER_2: [],
        ROTARY_CONTROL_TRANSCEIVER_2: [],
        KEY_TRANSCEIVER: [],
      },
    };
    const key = (type: string, opts: Parameters<typeof senderKey>[3]) =>
      senderKey(table, 'SWITCH_VIRTUAL_RECEIVER', type, opts);
    expect(key('MULTI_MODE_INPUT_TRANSMITTER', { operationMode: 2 })).toBe('MULTI_MODE_INPUT_TRANSMITTER_2');
    expect(key('MULTI_MODE_INPUT_TRANSMITTER', { operationMode: 1, receiverDeviceType: 'HmIP-FDC' })).toBe(
      'MULTI_MODE_INPUT_TRANSMITTER_1_FDC',
    );
    expect(key('MULTI_MODE_INPUT_TRANSMITTER', { operationMode: 1, receiverDeviceType: 'HmIP-BSM' })).toBe(
      'MULTI_MODE_INPUT_TRANSMITTER_1',
    );
    // Mode not read (yet) or without a file of its own: the plain type
    expect(key('MULTI_MODE_INPUT_TRANSMITTER', {})).toBe('MULTI_MODE_INPUT_TRANSMITTER');
    expect(key('ROTARY_CONTROL_TRANSCEIVER', { senderAddress: '0001:2' })).toBe('ROTARY_CONTROL_TRANSCEIVER_2');
    expect(key('KEY_TRANSCEIVER', { senderAddress: '0001:2' })).toBe('KEY_TRANSCEIVER');
  });

  it('detects the profile whose values fit, like get_cur_profile2', () => {
    expect(detectProfile([on, off], { SHORT_PROFILE_ACTION_TYPE: 1, SHORT_JT_ON: 3, SHORT_ON_TIME_BASE: 2 })).toBe(1);
    expect(detectProfile([on, off], { SHORT_PROFILE_ACTION_TYPE: 1, SHORT_JT_ON: 6 })).toBe(2);
    // Nothing fits: expert
    expect(detectProfile([on, off], { SHORT_PROFILE_ACTION_TYPE: 0, SHORT_JT_ON: 3 })).toBe(0);
  });

  it('writes the first values, keeping adjustable ones of the current profile', () => {
    const current = { SHORT_PROFILE_ACTION_TYPE: 1, SHORT_JT_ON: 3, SHORT_ON_TIME_BASE: 2 };
    expect(profileValues(on, description, current, false)).toEqual({
      SHORT_PROFILE_ACTION_TYPE: 1,
      SHORT_JT_ON: 1,
      SHORT_ON_TIME_BASE: 7,
    });
    expect(profileValues(on, description, current, true)).toEqual(current);
  });

  it('filters by the sender device type', () => {
    const only = profile(3, {}, { whitelist: ['HmIP-WRC2'] });
    const t = { R: { S: [on, only] } };
    expect(profilesFor(t, 'R', 'S', 'HmIP-BRC2').map((p) => p.id)).toEqual([1]);
    expect(profilesFor(t, 'R', 'S', 'HmIP-WRC2').map((p) => p.id)).toEqual([1, 3]);
  });

  it('encodes HmIP times as base and factor', () => {
    expect(encodeHmipTime(0)).toEqual({ base: 0, factor: 0 });
    expect(encodeHmipTime(45)).toEqual({ base: 2, factor: 9 });
    expect(encodeHmipTime(180)).toEqual({ base: 3, factor: 18 });
    expect(encodeHmipTime(3600)).toEqual({ base: 5, factor: 12 });
    expect(encodeHmipTime(PERMANENT)).toEqual({ base: 7, factor: 31 });
    expect(decodeHmipTime(4, 3)).toBe(180);
    expect(decodeHmipTime(7, 31)).toBe(PERMANENT);
  });

  it('has the imported profiles of the WebUI', () => {
    const switchKey = (switchReceiver as unknown as Record<string, LinkProfile[]>).KEY_TRANSCEIVER;
    expect(switchKey.map((p) => p.name.de)).toEqual(['Schalter ein', 'Schalter aus', 'Schalter ein / aus']);
    expect(switchKey[0].fields.map((f) => f.params[0])).toContain('SHORT_ON_TIME');
  });
});

describe('linkParameterNames', () => {
  // The floor heating link of a wall thermostat (HmIP-WTH) and a floor
  // heating actuator (HmIP-FAL), as CLIMATECONTROL_FLOOR_TRANSMITTER.tcl
  const profiles = (floorHeating as unknown as Record<string, LinkProfile[]>).CLIMATECONTROL_FLOOR_TRANSMITTER;
  const names = linkParameterNames(profiles, 'de', (key) => key, 'lang');

  it('names parameters and choices as the WebUI profile does', () => {
    expect(names.nameOf('SHORT_FLOOR_HEATING_MODE')).toBe('Art/Typ der Anlage');
    expect(names.optionOf('SHORT_FLOOR_HEATING_MODE', 2, 'RADIATOR')).toBe('Radiator');
    expect(names.nameOf('SHORT_HEATING_DISABLE')).toBe('Im Heiz-Modus');
    expect(names.optionOf('SHORT_HEATING_DISABLE', 1, 'DISABLE')).toBe('aktiv');
  });

  it('falls back to the catalog and readable enum values, marking long presses', () => {
    expect(names.nameOf('LONG_HUMIDITY_LIMIT_VALUE')).toBe(
      'Luftfeuchtigkeitswert für die Ansteuerung eines externen Luftentfeuchters (lang)',
    );
    expect(names.nameOf('SHORT_ON_TIME')).toBe('On time');
    expect(names.optionOf('SHORT_ON_TIME_MODE', 0, 'ABSOLUTE')).toBe('Absolute');
  });
});
