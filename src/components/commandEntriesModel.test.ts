import { describe, expect, it } from 'vitest';
import { CCU_CAPABILITIES } from '../hooks/capabilities';
import type { Channel, Program, Sysvar } from '../types/types';
import { buildEntries, channelTarget, type EntrySources } from './commandEntriesModel';

const LITE = { ...CCU_CAPABILITIES, programs: false, sysvars: false, history: false };

const channel = (id: number, extra: Partial<Channel> = {}) =>
  ({
    id,
    name: `Kanal ${id}`,
    address: `0001:${id}`,
    interfaceName: 'HmIP-RF',
    type: 'SWITCH_VIRTUAL_RECEIVER',
    statusAddress: '0001:0',
    datapoints: { STATE: false },
    ...extra,
  }) as Channel;

const program = (id: number, extra: Partial<Program> = {}): Program => ({
  id,
  name: `Programm ${id}`,
  active: true,
  visible: true,
  operate: true,
  ...extra,
});

const sysvar = (id: number, extra: Partial<Sysvar> = {}): Sysvar => ({
  id,
  name: `Variable ${id}`,
  visible: true,
  kind: 'bool',
  value: false,
  ...extra,
});

const sources = (extra: Partial<EntrySources> = {}): EntrySources => ({
  rooms: [{ id: 1, name: 'Wohnzimmer' }],
  trades: [{ id: 5, name: 'Licht' }],
  favorites: [{ id: 9, name: 'Abends', items: [] }],
  channels: [channel(11, { rooms: [1], trades: [5] })],
  programs: [program(21), program(22, { visible: false }), program(23, { internal: true })],
  sysvars: [sysvar(31), sysvar(32, { visible: false })],
  capabilities: CCU_CAPABILITIES,
  userLevel: 'user',
  authRequired: true,
  arrange: false,
  ...extra,
});

const ids = (s: EntrySources) => buildEntries(s).map((e) => e.id);

describe('buildEntries', () => {
  it('lists hidden programs and system variables only for administrators, internal programs never', () => {
    expect(ids(sources())).toEqual(expect.arrayContaining(['program:21', 'sysvar:31']));
    expect(ids(sources())).not.toContain('program:22');
    expect(ids(sources())).not.toContain('sysvar:32');
    const admin = ids(sources({ userLevel: 'admin' }));
    expect(admin).toEqual(expect.arrayContaining(['program:21', 'program:22', 'sysvar:31', 'sysvar:32']));
    expect(admin).not.toContain('program:23');
  });

  it('offers the setup only to administrators', () => {
    expect(ids(sources())).not.toContain('page:setup');
    expect(ids(sources({ userLevel: 'admin' }))).toContain('page:setup');
  });

  it('leaves out on openccu-lite what it does not have, even with data at hand', () => {
    const lite = ids(sources({ capabilities: LITE, userLevel: 'admin' }));
    for (const id of ['page:programs', 'page:sysvars', 'page:history', 'program:21', 'sysvar:31']) {
      expect(lite).not.toContain(id);
    }
    expect(lite).toEqual(expect.arrayContaining(['page:favorites', 'page:devices', 'room:1', 'channel:11']));
  });

  it('offers arranging and logging out only where they work', () => {
    expect(ids(sources({ authRequired: false }))).not.toContain('action:logout');
    expect(ids(sources())).toContain('action:logout');
    expect(ids(sources())).not.toContain('action:arrange');
    expect(ids(sources({ arrange: true }))).toContain('action:arrange');
    expect(ids(sources({ authRequired: false }))).toContain('action:theme');
  });

  it('leaves out hidden channels and names room and trade of the others', () => {
    const entries = buildEntries(
      sources({ channels: [channel(11, { rooms: [1], trades: [5] }), channel(12, { type: 'MAINTENANCE' })] }),
    );
    expect(entries.map((e) => e.id)).not.toContain('channel:12');
    const shown = entries.find((e) => e.id === 'channel:11');
    expect(shown?.detail).toBe('Wohnzimmer · Licht');
    expect(shown?.keywords).toContain('0001:11');
  });

  it('gives every entry its own id', () => {
    const all = ids(sources({ userLevel: 'admin', arrange: true }));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('channelTarget', () => {
  it('opens the room, else the trade, else all devices', () => {
    expect(channelTarget(channel(1, { rooms: [3], trades: [5] }))).toEqual({
      kind: 'route',
      to: '/room/$roomId',
      params: { roomId: '3' },
    });
    expect(channelTarget(channel(1, { trades: [5] }))).toEqual({
      kind: 'route',
      to: '/trade/$tradeId',
      params: { tradeId: '5' },
    });
    expect(channelTarget(channel(1))).toEqual({ kind: 'route', to: '/devices', params: undefined });
  });
});
