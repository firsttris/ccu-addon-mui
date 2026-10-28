import { describe, expect, it } from 'vitest';
import type { Channel } from '../../types/types';
import { isLight } from '../../controls/light/isLight';
import { asShown, changedNames, nameFields, shownName, withShownNames } from './tileNamesModel';

const channel = (id: number, name: string, displayName?: string) =>
  ({ id, name, displayName, address: `LEQ${id}:1`, type: 'SWITCH', datapoints: {} }) as unknown as Channel;

describe('shownName', () => {
  it('shows the name given in the app, else the CCU name', () => {
    expect(shownName(channel(1, 'SAD - Jugendzimmer:1', 'Leselampe'))).toBe('Leselampe');
    expect(shownName(channel(1, 'SAD - Jugendzimmer:1'))).toBe('SAD - Jugendzimmer:1');
  });

  it('shows the name being given while arranging, an empty one gives the CCU name back', () => {
    const given = channel(1, 'SAD - Jugendzimmer:1', 'Leselampe');
    expect(shownName(given, ' Schreibtisch ')).toBe('Schreibtisch');
    expect(shownName(given, '')).toBe('SAD - Jugendzimmer:1');
  });
});

describe('asShown', () => {
  it('hands a channel without a name of its own on as it is', () => {
    const plain = channel(1, 'Flur');
    expect(asShown(plain)).toBe(plain);
  });

  it('gives the tile the shown name, the same object as long as it stays', () => {
    const given = channel(1, 'SAD - Jugendzimmer:1', 'Leselampe');
    const first = asShown(given);
    expect(first.name).toBe('Leselampe');
    expect(first.displayName).toBe('Leselampe');
    expect(asShown(given)).toBe(first);
    expect(asShown(given, 'Schreibtisch').name).toBe('Schreibtisch');
  });

  it("keeps the CCU's name for what the name says about the channel", () => {
    const shown = asShown(channel(1, 'Wohnzimmer Licht', 'Decke'));
    expect(shown.ccuName).toBe('Wohnzimmer Licht');
    // A light stays a light under a name that doesn't sound like one
    expect(isLight(shown, new Set())).toBe(true);
    expect(isLight(asShown(channel(2, 'Steckdose', 'Leselampe')), new Set())).toBe(false);
  });
});

describe('withShownNames', () => {
  it('names the channels of every type, drafts first', () => {
    const lights = [channel(1, 'SA - Licht:1', 'Deckenlicht'), channel(2, 'SAD - Dimmer:1')];
    const shown = withShownNames([['SWITCH', lights]], { 2: 'Leselampe' });
    expect(shown[0][1].map((c) => c.name)).toEqual(['Deckenlicht', 'Leselampe']);
  });

  it('keeps the entry of a type whose channels stay as they are', () => {
    // An event changes the blind: useChannels hands on the same switches
    const switches: [string, Channel[]] = ['SWITCH', [channel(1, 'Licht')]];
    const before = withShownNames([switches, ['BLIND', [channel(2, 'Rollladen')]]], {});
    const after = withShownNames([switches, ['BLIND', [channel(2, 'Rollladen')]]], {});
    expect(after[0]).toBe(before[0]);
    expect(after[0]).toBe(switches);
    // With a name given, the shown entry stays the same as long as the names do
    const named: [string, Channel[]] = ['SWITCH', [channel(3, 'SA - Licht:1', 'Deckenlicht')]];
    const first = withShownNames([named], {})[0];
    expect(first[1][0].name).toBe('Deckenlicht');
    expect(withShownNames([named], {})[0]).toBe(first);
    expect(withShownNames([named], { 3: 'Decke' })[0]).not.toBe(first);
  });
});

describe('changedNames', () => {
  it('stores only what differs from the stored names, trimmed', () => {
    const byId = new Map([
      [1, channel(1, 'SA - Licht:1', 'Deckenlicht')],
      [2, channel(2, 'SAD - Dimmer:1')],
      [3, channel(3, 'RA - Rollladen:4', 'Rollladen')],
    ]);
    expect(changedNames({ 1: 'Deckenlicht ', 2: ' Leselampe', 3: '', 9: 'weg' }, byId)).toEqual([
      { id: 2, name: 'Leselampe' },
      { id: 3, name: '' },
    ]);
  });
});

describe('nameFields', () => {
  it('gives each channel of a tile a field, with the name being given, else the stored one', () => {
    const byId = new Map([
      [1, channel(1, 'Wandtaster oben', 'Licht')],
      [2, channel(2, 'Wandtaster unten')],
    ]);
    expect(nameFields([1, 2], byId, {})).toEqual([
      { id: 1, ccuName: 'Wandtaster oben', name: 'Licht' },
      { id: 2, ccuName: 'Wandtaster unten', name: '' },
    ]);
    expect(nameFields([1, 2], byId, { 1: '', 2: 'Rollo' })).toEqual([
      { id: 1, ccuName: 'Wandtaster oben', name: '' },
      { id: 2, ccuName: 'Wandtaster unten', name: 'Rollo' },
    ]);
  });

  it('leaves out a channel that is gone', () => {
    expect(nameFields([1, 9], new Map([[1, channel(1, 'RMZ VT:1')]]), {})).toEqual([
      { id: 1, ccuName: 'RMZ VT:1', name: '' },
    ]);
  });
});
