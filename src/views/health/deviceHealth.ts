import type { DeviceHealth } from '../../types/protocol';

// How the app judges a device's health from its maintenance channel

export type BatteryState = 'empty' | 'low' | 'ok' | 'none';
export type SignalState = 'good' | 'fair' | 'poor' | 'unknown';

const value = (device: DeviceHealth, name: string) => device.values[name]?.value;
const isTrue = (device: DeviceHealth, name: string) => value(device, name) === true;
const number = (device: DeviceHealth, name: string) => {
  const v = value(device, name);
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};

// Within this share above the device's LOW_BAT limit the battery is
// "soon empty": on a 2.2 V limit from 2.42 V
export const LOW_MARGIN = 0.1;

export const battery = (device: DeviceHealth): { state: BatteryState; voltage?: number; limit?: number } => {
  const voltage = number(device, 'OPERATING_VOLTAGE');
  const limit = device.lowBatLimit;
  if (isTrue(device, 'LOW_BAT')) return { state: 'empty', voltage, limit };
  if (voltage === undefined && !('LOW_BAT' in device.values)) return { state: 'none' };
  if (voltage !== undefined && limit !== undefined && voltage <= limit * (1 + LOW_MARGIN)) {
    return { state: 'low', voltage, limit };
  }
  return { state: 'ok', voltage, limit };
};

// RSSI in dBm; BidCos reports 65536 or -65535 while unknown, HmIP 0 or 1
const validRssi = (rssi: number | undefined) => (rssi !== undefined && rssi < 0 && rssi > -128 ? rssi : undefined);

// The weaker direction counts: how the device hears the CCU (RSSI_DEVICE)
// and how the CCU hears it (RSSI_PEER)
export const signal = (device: DeviceHealth): { state: SignalState; rssi?: number } => {
  const values = [validRssi(number(device, 'RSSI_DEVICE')), validRssi(number(device, 'RSSI_PEER'))].filter(
    (v): v is number => v !== undefined,
  );
  if (values.length === 0) return { state: 'unknown' };
  const rssi = Math.min(...values);
  return { state: rssi >= -70 ? 'good' : rssi >= -85 ? 'fair' : 'poor', rssi };
};

// The latest time any maintenance value was set (Unix seconds)
export const lastSeen = (device: DeviceHealth) => {
  const times = Object.values(device.values)
    .map((v) => v.time ?? 0)
    .filter((t) => t > 0);
  return times.length > 0 ? Math.max(...times) : undefined;
};

export type Flag = 'unreach' | 'wasUnreach' | 'configPending' | 'updatePending' | 'sabotage' | 'dutyCycle';

export const flags = (device: DeviceHealth): Flag[] => {
  const result: Flag[] = [];
  if (isTrue(device, 'UNREACH')) result.push('unreach');
  else if (isTrue(device, 'STICKY_UNREACH')) result.push('wasUnreach');
  if (isTrue(device, 'CONFIG_PENDING')) result.push('configPending');
  if (isTrue(device, 'UPDATE_PENDING')) result.push('updatePending');
  if (isTrue(device, 'SABOTAGE')) result.push('sabotage');
  if (isTrue(device, 'DUTY_CYCLE')) result.push('dutyCycle');
  return result;
};

// How urgent a device is, for sorting: higher first
export const urgency = (device: DeviceHealth) => {
  const f = flags(device);
  const b = battery(device).state;
  const s = signal(device).state;
  return (
    (f.includes('unreach') ? 100 : 0) +
    (b === 'empty' ? 50 : b === 'low' ? 30 : 0) +
    (s === 'poor' ? 20 : 0) +
    (f.includes('sabotage') ? 15 : 0) +
    (f.includes('wasUnreach') ? 10 : 0) +
    (f.includes('configPending') || f.includes('updatePending') ? 5 : 0)
  );
};

export const needsAttention = (device: DeviceHealth) => urgency(device) > 0;

// Signal strength as 1 to 4 bars
export const bars = (rssi: number) => (rssi >= -60 ? 4 : rssi >= -70 ? 3 : rssi >= -85 ? 2 : 1);

// "5 minutes ago", "yesterday": the largest fitting unit
export const formatAge = (seconds: number, now: number, locale: string) => {
  const diff = Math.max(0, now - seconds);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (diff < 60) return format.format(0, 'second');
  if (diff < 3600) return format.format(-Math.floor(diff / 60), 'minute');
  if (diff < 86400) return format.format(-Math.floor(diff / 3600), 'hour');
  return format.format(-Math.floor(diff / 86400), 'day');
};
