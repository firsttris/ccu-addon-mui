import { describe, expect, it } from 'vitest';
import type { DeviceHealth } from '../../types/protocol';
import { bars, battery, flags, formatAge, lastSeen, needsAttention, signal, urgency } from './deviceHealth';

const device = (values: Record<string, unknown>, lowBatLimit?: number): DeviceHealth => ({
  address: 'X',
  name: 'Device',
  type: 'HmIP-SWDO',
  interfaceName: 'HmIP-RF',
  values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { value: v as boolean | number, time: 1000 }])),
  lowBatLimit,
});

describe('battery', () => {
  it('reports empty when the device sets LOW_BAT', () => {
    expect(battery(device({ LOW_BAT: true, OPERATING_VOLTAGE: 1.0 }, 1.1)).state).toBe('empty');
  });

  it('reports low within 10 % above the limit', () => {
    expect(battery(device({ LOW_BAT: false, OPERATING_VOLTAGE: 2.4 }, 2.2)).state).toBe('low');
    expect(battery(device({ LOW_BAT: false, OPERATING_VOLTAGE: 2.5 }, 2.2)).state).toBe('ok');
  });

  it('is ok with only LOW_BAT and none without battery values', () => {
    expect(battery(device({ LOW_BAT: false })).state).toBe('ok');
    expect(battery(device({ UNREACH: false })).state).toBe('none');
  });
});

describe('signal', () => {
  it('takes the weaker direction', () => {
    expect(signal(device({ RSSI_DEVICE: -60, RSSI_PEER: -88 }))).toEqual({ state: 'poor', rssi: -88 });
    expect(signal(device({ RSSI_DEVICE: -75, RSSI_PEER: -72 }))).toEqual({ state: 'fair', rssi: -75 });
    expect(signal(device({ RSSI_DEVICE: -65 }))).toEqual({ state: 'good', rssi: -65 });
  });

  it('ignores the placeholders for unknown values', () => {
    expect(signal(device({ RSSI_DEVICE: 65536, RSSI_PEER: 0 })).state).toBe('unknown');
    expect(signal(device({ RSSI_DEVICE: 1, RSSI_PEER: -70 }))).toEqual({ state: 'good', rssi: -70 });
  });

  it('maps to bars', () => {
    expect([-55, -65, -80, -95].map(bars)).toEqual([4, 3, 2, 1]);
  });
});

describe('flags and urgency', () => {
  it('lists unreach before the sticky flag', () => {
    expect(flags(device({ UNREACH: true, STICKY_UNREACH: true, CONFIG_PENDING: true }))).toEqual([
      'unreach',
      'configPending',
    ]);
    expect(flags(device({ UNREACH: false, STICKY_UNREACH: true }))).toEqual(['wasUnreach']);
  });

  it('sorts unreachable above empty batteries', () => {
    const unreach = device({ UNREACH: true });
    const empty = device({ LOW_BAT: true });
    expect(urgency(unreach)).toBeGreaterThan(urgency(empty));
    expect(needsAttention(device({ LOW_BAT: false, RSSI_DEVICE: -60 }))).toBe(false);
  });
});

describe('lastSeen and formatAge', () => {
  it('takes the latest time', () => {
    const d = device({ LOW_BAT: false });
    d.values.RSSI_DEVICE = { value: -60, time: 2000 };
    d.values.UNREACH = { value: false, time: 0 };
    expect(lastSeen(d)).toBe(2000);
    expect(lastSeen(device({}))).toBeUndefined();
  });

  it('formats in the largest unit', () => {
    expect(formatAge(1000, 1030, 'en')).toBe('now');
    expect(formatAge(1000, 1000 + 5 * 60, 'en')).toBe('5 minutes ago');
    expect(formatAge(1000, 1000 + 3 * 3600, 'en')).toBe('3 hours ago');
    expect(formatAge(1000, 1000 + 86400, 'de')).toBe('gestern');
  });
});
