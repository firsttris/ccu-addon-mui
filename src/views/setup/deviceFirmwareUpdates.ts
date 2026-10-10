import type { Device } from '../../types/types';
import type { DeviceFirmwareVersion } from '../../types/protocol';
import { isNewerVersion } from '../../lib/version';

export interface OnlineFirmware {
  version: string;
  // The CCU has it already (AVAILABLE_FIRMWARE)
  onCcu: boolean;
}

// The newer firmware eQ-3 offers for a device, as webui.js setDeviceVersion
// compares it: BidCos devices report major.minor only, so only those parts
// count; devices that can't be updated (UPDATABLE) are left out
export const onlineFirmware = (
  device: Device,
  versions: DeviceFirmwareVersion[] | undefined,
): OnlineFirmware | undefined => {
  if (!versions || !device.updatable || !device.firmware) {
    return undefined;
  }
  // A type listed twice: the last entry counts, as setDeviceFirmwareVersions
  // overwrites earlier ones (webui.js)
  const version = versions.findLast((v) => v.type === device.type.toLowerCase())?.version;
  if (!version) {
    return undefined;
  }
  const comparable = device.firmware.split('.').length === 2 ? version.split('.').slice(0, 2).join('.') : version;
  if (!isNewerVersion(comparable, device.firmware)) {
    return undefined;
  }
  return { version, onCcu: device.availableFirmware === comparable };
};

export interface TypeUpdate {
  type: string;
  version: string;
  devices: Device[];
  // Installed versions, oldest first
  installed: string[];
  onCcu: boolean;
}

// The device types with newer firmware at eQ-3, one entry per type
export const typeUpdates = (
  devices: Device[] | undefined,
  versions: DeviceFirmwareVersion[] | undefined,
): TypeUpdate[] => {
  const byType = new Map<string, TypeUpdate>();
  for (const device of devices ?? []) {
    const online = onlineFirmware(device, versions);
    if (!online) continue;
    const entry = byType.get(device.type) ?? {
      type: device.type,
      version: online.version,
      devices: [],
      installed: [],
      onCcu: true,
    };
    entry.devices.push(device);
    if (!entry.installed.includes(device.firmware ?? '')) {
      entry.installed.push(device.firmware ?? '');
    }
    entry.onCcu = entry.onCcu && online.onCcu;
    byType.set(device.type, entry);
  }
  return [...byType.values()]
    .map((u) => ({ ...u, installed: u.installed.sort((a, b) => (isNewerVersion(a, b) ? 1 : -1)) }))
    .sort((a, b) => a.type.localeCompare(b.type));
};
