import { describe, expect, it } from 'vitest';
import { defaultLayout, defaultWidth, moveSection, orderSections, parseLayout, responsiveLayouts, rowsFor, toSaved } from './tileLayout';

const tiles = [
  { key: 'c:A:1', minPx: 150 },
  { key: 'c:A:2', minPx: 150 },
  { key: 'd:B', minPx: 340 },
];

describe('tileLayout', () => {
  it('sizes tiles like the section grids', () => {
    // 1376 px with padding: the climate grid (minmax(232px, 1fr)) of 1352 px
    // shows five side by side, a fifth of the columns each
    expect(defaultWidth(232, 'lg', 1376)).toBe(12);
    expect(defaultWidth(340, 'lg', 1376)).toBe(20);
    expect(defaultWidth(150, 'lg', 1376)).toBe(7);
    // A phone: one per row
    expect(defaultWidth(340, 'xxs', 390)).toBe(10);
    expect(rowsFor(160)).toBe(9);
  });

  it('flows tiles left to right and wraps', () => {
    expect(defaultLayout(tiles, 'xs', 700)).toEqual([
      { i: 'c:A:1', x: 0, y: 0, w: 5 },
      { i: 'c:A:2', x: 5, y: 0, w: 5 },
      { i: 'd:B', x: 0, y: 100, w: 20 },
    ]);
  });

  it('keeps saved positions, drops tiles that are gone and adds new ones', () => {
    const saved = { lg: [{ i: 'd:B', x: 0, y: 0, w: 6 }, { i: 'c:GONE:1', x: 6, y: 0, w: 2 }] };
    const lg = responsiveLayouts(tiles, saved, { 'd:B': 300 }, 1376).lg!;
    expect(lg.map((t) => t.i)).toEqual(['d:B', 'c:A:1', 'c:A:2']);
    expect(lg[0]).toMatchObject({ x: 0, w: 6, h: rowsFor(300) });
    expect(lg[1].y).toBeGreaterThan(1000);
  });

  it('makes tiles side by side as tall as the tallest, as the section grids do', () => {
    // A thermostat whose long name wraps is taller than the other two
    const heights = { 'c:A:1': 300, 'c:A:2': 300, 'd:B': 330 };
    const own = responsiveLayouts(tiles, undefined, heights, 1376).lg!;
    expect(own.map((t) => t.h)).toEqual([rowsFor(300), rowsFor(300), rowsFor(330)]);
    const equal = responsiveLayouts(tiles, undefined, heights, 1376, true).lg!;
    expect(equal.map((t) => t.h)).toEqual([rowsFor(330), rowsFor(330), rowsFor(330)]);
  });

  it('stores positions and widths only, and reads them back', () => {
    const tiles = toSaved({ lg: [{ i: 'd:B', x: 1, y: 2, w: 3, h: 9 }] });
    expect(tiles).toEqual({ lg: [{ i: 'd:B', x: 1, y: 2, w: 3 }] });
    const saved = { v: 3, order: ['lights'], sections: { lights: tiles } };
    expect(parseLayout(JSON.stringify(saved))).toEqual(saved);
    expect(parseLayout('nonsense')).toBeNull();
    expect(parseLayout('')).toBeNull();
  });

  it('reads layouts of version 2 with five times the columns', () => {
    const v2 = { v: 2, order: ['climate'], sections: { climate: { lg: [{ i: 'd:B', x: 3, y: 0, w: 3 }] } } };
    expect(parseLayout(JSON.stringify(v2))).toEqual({
      v: 3,
      order: ['climate'],
      sections: { climate: { lg: [{ i: 'd:B', x: 15, y: 0, w: 15 }] } },
    });
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
