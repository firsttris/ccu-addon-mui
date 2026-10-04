import { describe, expect, it } from 'vitest';
import { firmwareStatus, updateAction } from './Firmware';
import { Device } from '../../types/types';

const device = (fields: Partial<Device>): Device => ({
  interfaceName: 'HmIP-RF',
  type: 'HmIP-SWDO',
  address: '0008DA8A9F1234',
  paramsets: [],
  version: 1,
  firmware: '1.0.12',
  ...fields,
});

describe('updateAction', () => {
  it('starts HmIP updates once the device has the firmware', () => {
    expect(
      updateAction(
        device({
          availableFirmware: '1.2.6',
          firmwareUpdateState: 'DELIVER_FIRMWARE_IMAGE',
        }),
      ),
    ).toBe(undefined);
    expect(
      updateAction(
        device({
          availableFirmware: '1.2.6',
          firmwareUpdateState: 'READY_FOR_UPDATE',
        }),
      ),
    ).toBe('install');
    expect(
      updateAction(
        device({
          availableFirmware: '1.2.6',
          firmwareUpdateState: 'DO_UPDATE_PENDING',
        }),
      ),
    ).toBe('install');
  });

  it('updates BidCos devices whenever the CCU has newer firmware', () => {
    expect(
      updateAction(
        device({
          interfaceName: 'BidCos-RF',
          firmware: '2.8',
          availableFirmware: '2.11',
        }),
      ),
    ).toBe('install');
    expect(updateAction(device({ interfaceName: 'BidCos-RF', firmware: '2.8' }))).toBe(undefined);
  });

  it('knows which access points update live', () => {
    const live = {
      availableFirmware: '2.4.0',
      firmwareUpdateState: 'LIVE_NEW_FIRMWARE_AVAILABLE',
    };
    expect(updateAction(device({ ...live, type: 'HmIP-HAP', firmware: '2.0.6' }))).toBe('unsupported');
    expect(updateAction(device({ ...live, type: 'HmIP-HAP', firmware: '1.4.2' }))).toBe('unsupported');
    expect(updateAction(device({ ...live, type: 'HmIP-HAP', firmware: '2.2.4' }))).toBe('install');
    expect(
      updateAction(
        device({
          ...live,
          interfaceName: 'HmIP-Wired',
          type: 'HmIPW-DRAP',
          firmware: '2.1.2',
        }),
      ),
    ).toBe('install');
    expect(updateAction(device({ ...live, type: 'HmIP-HAP2', firmware: '1.0.0' }))).toBe('automatic');
  });
});

describe('firmwareStatus', () => {
  it('explains each state', () => {
    expect(firmwareStatus(device({ interfaceName: 'BidCos-RF', availableFirmware: '2.11' }))).toContain('2.11');
    expect(firmwareStatus(device({ interfaceName: 'BidCos-RF' }))).toBe(
      'The CCU has no newer firmware for this device.',
    );
    expect(firmwareStatus(device({ firmwareUpdateState: 'LIVE_UP_TO_DATE' }))).toBe('The firmware is up to date.');
    expect(
      firmwareStatus(
        device({
          availableFirmware: '1.2.6',
          firmwareUpdateState: 'DO_UPDATE_PENDING',
        }),
      ),
    ).toContain('press its button');
  });
});
