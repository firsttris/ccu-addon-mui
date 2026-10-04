import { describe, expect, it } from 'vitest';
import { defaultLayout, defaultWidth, moveSection, orderSections, parseLayout, responsiveLayouts, rowsFor, toSaved } from './tileLayout';

const tiles = [
  { key: 'c:A:1', minPx: 150 },
  { key: 'c:A:2', minPx: 150 },
  { key: 'd:B', minPx: 340 },
];

describe('tileLayout', () => {
  it('sizes tiles like the section grids', () => {
    expect(defaultWidth(150, 'lg')).toBe(2);
    expect(defaultWidth(340, 'lg')).toBe(4);
    expect(defaultWidth(340, 'xxs')).toBe(2);
    expect(rowsFor(160)).toBe(9);
  });

  it('flows tiles left to right and wraps', () => {
    expect(defaultLayout(tiles, 'xs')).toEqual([
      { i: 'c:A:1', x: 0, y: 0, w: 2 },
      { i: 'c:A:2', x: 2, y: 0, w: 2 },
      { i: 'd:B', x: 0, y: 100, w: 3 },
    ]);
  });

  it('keeps saved positions, drops tiles that are gone and adds new ones', () => {
    const saved = { lg: [{ i: 'd:B', x: 0, y: 0, w: 6 }, { i: 'c:GONE:1', x: 6, y: 0, w: 2 }] };
    const lg = responsiveLayouts(tiles, saved, { 'd:B': 300 }).lg!;
    expect(lg.map((t) => t.i)).toEqual(['d:B', 'c:A:1', 'c:A:2']);
    expect(lg[0]).toMatchObject({ x: 0, w: 6, h: rowsFor(300) });
    expect(lg[1].y).toBeGreaterThan(1000);
  });

  it('stores positions and widths only, and reads them back', () => {
    const tiles = toSaved({ lg: [{ i: 'd:B', x: 1, y: 2, w: 3, h: 9 }] });
    expect(tiles).toEqual({ lg: [{ i: 'd:B', x: 1, y: 2, w: 3 }] });
    const saved = { v: 2, order: ['lights'], sections: { lights: tiles } };
    expect(parseLayout(JSON.stringify(saved))).toEqual(saved);
    expect(parseLayout('nonsense')).toBeNull();
    expect(parseLayout('')).toBeNull();
  });

  it('drops the old layout of one grid for all tiles', () => {
    expect(parseLayout(JSON.stringify({ v: 1, layouts: { lg: [] } }))).toBeNull();
  });

  it('orders sections as saved, new ones after them in their place', () => {
    const sections = ['climate', 'lights', 'blinds', 'sensors'].map((key) => ({ key }));
    expect(orderSections(sections, ['blinds', 'climate']).map((s) => s.key)).toEqual(['blinds', 'climate', 'lights', 'sensors']);
    expect(orderSections(sections, []).map((s) => s.key)).toEqual(['climate', 'lights', 'blinds', 'sensors']);
  });

  it('moves a section up and down, not past the ends', () => {
    expect(moveSection(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveSection(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveSection(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveSection(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
  });
});
