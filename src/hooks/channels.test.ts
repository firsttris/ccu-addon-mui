import { describe, expect, it } from 'vitest';
import { Channel } from '../types/types';
import { applyEvent, groupChannelsByType, isHiddenChannel } from './channels';

const channel = (type: string, address: string, datapoints: Record<string, unknown> = { STATE: false }) =>
  ({
    id: 1,
    name: address,
    address,
    interfaceName: 'HmIP-RF',
    type,
    statusAddress: address.replace(/:\d+$/, ':0'),
    datapoints,
  }) as Channel;

describe('isHiddenChannel', () => {
  it('hides configuration-only channels', () => {
    expect(isHiddenChannel(channel('MAINTENANCE', 'A:0'))).toBe(true);
    expect(isHiddenChannel(channel('SWITCH_WEEK_PROFILE', 'A:9'))).toBe(true);
    expect(isHiddenChannel(channel('KEY_TRANSCEIVER', 'A:1', {}))).toBe(true);
  });

  it('shows channels with state, also of unknown types', () => {
    expect(isHiddenChannel(channel('SWITCH_VIRTUAL_RECEIVER', 'A:1'))).toBe(false);
    expect(isHiddenChannel(channel('ROTARY_HANDLE_TRANSCEIVER', 'A:1'))).toBe(false);
  });
});

describe('groupChannelsByType', () => {
  it('puts types with a control first, then the others alphabetically', () => {
    const groups = groupChannelsByType([
      channel('TILT_SENSOR', 'A:1'),
      channel('SWITCH_VIRTUAL_RECEIVER', 'B:1'),
      channel('CONDITION_POWER', 'C:1'),
      channel('HEATING_CLIMATECONTROL_TRANSCEIVER', 'D:1'),
      channel('SWITCH_VIRTUAL_RECEIVER', 'E:1'),
      channel('SWITCH_WEEK_PROFILE', 'F:1'),
    ]);
    expect(groups.map(([type, channels]) => [type, channels.map((c) => c.address)])).toEqual([
      ['HEATING_CLIMATECONTROL_TRANSCEIVER', ['D:1']],
      ['SWITCH_VIRTUAL_RECEIVER', ['B:1', 'E:1']],
      ['CONDITION_POWER', ['C:1']],
      ['TILT_SENSOR', ['A:1']],
    ]);
  });
});

describe('groupChannelsByType with HmIP actuators', () => {
  it('leaves out the state channel when the switchable channel is shown', () => {
    const groups = groupChannelsByType([
      channel('SWITCH_TRANSMITTER', 'A:1'),
      channel('SWITCH_VIRTUAL_RECEIVER', 'A:2'),
      // Another device: its state channel alone is kept
      channel('SWITCH_TRANSMITTER', 'B:1'),
    ]);
    expect(groups.map(([type, channels]) => [type, channels.map((c) => c.address)])).toEqual([
      ['SWITCH_VIRTUAL_RECEIVER', ['A:2']],
      ['SWITCH_TRANSMITTER', ['B:1']],
    ]);
  });
});

describe('applyEvent', () => {
  const channels = [channel('SWITCH_VIRTUAL_RECEIVER', 'A:1'), channel('SWITCH_VIRTUAL_RECEIVER', 'B:1')];

  it('creates a new object only for the channel concerned', () => {
    const next = applyEvent(channels, { channel: 'A:1', datapoint: 'STATE', value: true });
    expect(next).not.toBe(channels);
    expect(next[0].datapoints).toEqual({ STATE: true });
    expect(next[1]).toBe(channels[1]);
  });

  it('returns the same array for an event of another channel', () => {
    expect(applyEvent(channels, { channel: 'X:1', datapoint: 'STATE', value: true })).toBe(channels);
  });

  it('applies device status to all channels of the device', () => {
    const device = [channel('SWITCH_VIRTUAL_RECEIVER', 'A:1'), channel('SWITCH_VIRTUAL_RECEIVER', 'A:2')];
    const next = applyEvent(device, { channel: 'A:0', datapoint: 'LOWBAT', value: true });
    expect(next.map((c) => c.status)).toEqual([{ LOW_BAT: true }, { LOW_BAT: true }]);
  });

  it('does not roll back a value an event changed in the meantime', () => {
    const rollback = { channel: 'A:1', datapoint: 'STATE', value: false };
    // The sent value (true) is still current: roll back
    const sent = applyEvent(channels, { channel: 'A:1', datapoint: 'STATE', value: true });
    expect(applyEvent(sent, rollback, { value: true })[0].datapoints).toEqual({ STATE: false });
    // An event has changed it since: keep that value
    const changed = applyEvent(sent, { channel: 'A:1', datapoint: 'STATE', value: 'other' });
    expect(applyEvent(changed, rollback, { value: true })).toBe(changed);
  });
});
