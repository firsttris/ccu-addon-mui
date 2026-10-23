import { describe, expect, it } from 'vitest';
import type { Channel } from '../../types/types';
import { asShown, changedNames, shownName, withShownNames } from './tileNamesModel';

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
});

describe('withShownNames', () => {
  it('names the channels of every type, drafts first', () => {
    const lights = [channel(1, 'SA - Licht:1', 'Deckenlicht'), channel(2, 'SAD - Dimmer:1')];
    const shown = withShownNames([['SWITCH', lights]], { 2: 'Leselampe' });
    expect(shown[0][1].map((c) => c.name)).toEqual(['Deckenlicht', 'Leselampe']);
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
