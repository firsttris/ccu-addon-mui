import { describe, expect, it } from 'vitest';
import type { Channel } from '../../../types/protocol';
import type { Device, ParamsetDescription } from '../../../types/types';
import {
  changesOf,
  channelCardsOf,
  deviceSectionsOf,
  type SettingsSection,
  transferOf,
  weekProgramKindOf,
  withDraft,
} from './deviceSettingsModel';

const section = (address: string, current = {}): SettingsSection => ({
  address,
  description: { LEVEL: { type: 'FLOAT' } } as unknown as ParamsetDescription,
  current,
});

describe('drafts', () => {
  it('drops a value set back to the saved one', () => {
    const drafts = withDraft({}, 'A:1', { LEVEL: 1 }, 'LEVEL', 2);
    expect(drafts).toEqual({ 'A:1': { LEVEL: 2 } });
    expect(withDraft(drafts, 'A:1', { LEVEL: 1 }, 'LEVEL', 1)).toEqual({ 'A:1': {} });
  });

  it('lists the changes with their old values', () => {
    const changes = changesOf([section('A:1', { LEVEL: 1 })], { 'A:1': { LEVEL: 2 }, 'B:1': { LEVEL: 3 } });
    expect(changes).toMatchObject([{ address: 'A:1', name: 'LEVEL', previous: 1, value: 2 }]);
  });
});

describe('transferOf', () => {
  const since = 1000;
  it('follows CONFIG_PENDING after saving', () => {
    expect(transferOf({ since: null, now: 0, configPending: true })).toBe('none');
    expect(transferOf({ since, now: since + 1000, configPending: false })).toBe('sending');
    expect(transferOf({ since, now: since + 1000, configPending: true })).toBe('pending');
    expect(transferOf({ since, now: since + 5000, configPending: false })).toBe('done');
    expect(transferOf({ since, now: since + 1000, configPending: undefined })).toBe('handedOver');
  });
});

describe('weekProgramKindOf', () => {
  it('tells the actuator by its week profile channel', () => {
    expect(weekProgramKindOf('BLIND_WEEK_PROFILE')).toBe('blind');
    expect(weekProgramKindOf('SWITCH_WEEK_PROFILE')).toBe('switch');
    expect(weekProgramKindOf('DIMMER_WEEK_PROFILE')).toBe('dimmer');
    expect(weekProgramKindOf('SWITCH_VIRTUAL_RECEIVER')).toBeNull();
  });
});

describe('channelCardsOf', () => {
  const device = {
    address: 'D',
    channels: [
      { address: 'D:0', type: 'MAINTENANCE', index: 0 },
      { address: 'D:1', type: 'SWITCH_TRANSMITTER', index: 1 },
      { address: 'D:3', type: 'SWITCH_VIRTUAL_RECEIVER', index: 3 },
      { address: 'D:2', type: 'SWITCH_VIRTUAL_RECEIVER', index: 2 },
    ],
  } as unknown as Device;
  const rega = (address: string, name: string) =>
    ({ address, name, type: 'SWITCH_VIRTUAL_RECEIVER', datapoints: { STATE: false } }) as unknown as Channel;

  it('has a card per channel in order, the rarely needed ones folded', () => {
    const cards = channelCardsOf({
      address: 'D',
      device,
      channels: [rega('D:2', 'Licht'), rega('D:3', 'Licht 2'), rega('X:1', 'other device')],
      sections: [section('D:1')],
      names: new Map([['D:2', 'Deckenlicht']]),
    });
    expect(cards.map((c) => [c.channel.address, c.label, c.folded])).toEqual([
      // Settings: shown, even without a name in ReGa
      ['D:1', 'D:1', false],
      ['D:2', 'Deckenlicht', false],
      // The 2nd virtual channel
      ['D:3', 'Licht 2', true],
    ]);
  });

  it('puts the device and channel 0 on the device card', () => {
    expect(deviceSectionsOf('D', [section('D'), section('D:0'), section('D:1')]).map((s) => s.address)).toEqual([
      'D',
      'D:0',
    ]);
  });
});
