import { describe, expect, it } from 'vitest';
import { onlineFirmware, typeUpdates } from './deviceFirmwareUpdates';
import { Device } from '../../types/types';

const device = (fields: Partial<Device>): Device => ({
  interfaceName: 'HmIP-RF',
  type: 'HmIP-WRC2',
  address: '000855699C4F38',
  paramsets: [],
  index: 0,
  flags: 1,
  version: 1,
  firmware: '1.6.2',
  updatable: true,
  ...fields,
});

const versions = [
  { type: 'hmip-wrc2', version: '1.6.4' },
  { type: 'hm-tc-it-wm-w-eu', version: '1.5.0' },
];

describe('onlineFirmware', () => {
  it('names newer firmware at eQ-3', () => {
    expect(onlineFirmware(device({}), versions)).toEqual({ version: '1.6.4', onCcu: false });
    expect(onlineFirmware(device({ availableFirmware: '1.6.4' }), versions)).toEqual({ version: '1.6.4', onCcu: true });
    expect(onlineFirmware(device({ firmware: '1.6.4' }), versions)).toBeUndefined();
    expect(onlineFirmware(device({ firmware: '1.8.0' }), versions)).toBeUndefined();
    expect(onlineFirmware(device({ updatable: false }), versions)).toBeUndefined();
  });

  it('compares BidCos versions by major and minor', () => {
    const thermostat = device({ interfaceName: 'BidCos-RF', type: 'HM-TC-IT-WM-W-EU', firmware: '1.4' });
    expect(onlineFirmware(thermostat, versions)).toEqual({ version: '1.5.0', onCcu: false });
    expect(onlineFirmware({ ...thermostat, availableFirmware: '1.5' }, versions)?.onCcu).toBe(true);
    expect(onlineFirmware({ ...thermostat, firmware: '1.5' }, versions)).toBeUndefined();
  });
});

describe('typeUpdates', () => {
  it('lists each type once', () => {
    const updates = typeUpdates(
      [device({}), device({ address: 'B', firmware: '1.4.8' }), device({ address: 'C', firmware: '1.6.4' })],
      versions,
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].devices).toHaveLength(2);
    expect(updates[0].installed).toEqual(['1.4.8', '1.6.2']);
    expect(updates[0].onCcu).toBe(false);
  });
});
