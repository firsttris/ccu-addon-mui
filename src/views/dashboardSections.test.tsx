import { describe, expect, it } from 'vitest';
import type { Channel } from '../types/types';
import { gridTiles } from './dashboardSections';

const key = (id: number, name: string, address: string) =>
  ({ id, name, address, type: 'VIRTUAL_KEY', interfaceName: 'BidCos-RF', datapoints: {} }) as unknown as Channel;

describe('gridTiles', () => {
  it("names a device's tile, so its channels can be given names (the keys of a device)", () => {
    const tiles = gridTiles({
      key: 'buttons',
      section: 'buttons',
      types: [
        [
          'VIRTUAL_KEY',
          [
            key(1, 'RMZ VT:1', 'BidCoS-RF:1'),
            key(2, 'Wandtaster Flur oben', 'LEQ1:1'),
            key(3, 'Wandtaster Flur unten', 'LEQ1:2'),
          ],
        ],
      ],
    });
    expect(tiles.map(({ key, name, channelIds }) => ({ key, name, channelIds }))).toEqual([
      { key: 'd:BidCoS-RF', name: 'RMZ VT:1', channelIds: [1] },
      { key: 'd:LEQ1', name: 'Wandtaster Flur', channelIds: [2, 3] },
    ]);
  });
});
