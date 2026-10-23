import { describe, expect, it } from 'vitest';
import {
  breakpointFor,
  columnsFor,
  columnsWidth,
  defaultLayout,
  defaultWidth,
  flowLayout,
  flowTracks,
  moveSection,
  orderSections,
  parseLayout,
  responsiveLayouts,
  rowsFor,
  rowLimit,
  toSaved,
  usedColumns,
  widestRow,
} from './tileLayout';

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
    // A color light spans two columns of the lights grid
    expect(defaultWidth(150, 'lg', 1376, 2)).toBe(14);
    expect(defaultWidth(150, 'xxs', 390, 2)).toBe(10);
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
    const saved = {
      lg: [
        { i: 'd:B', x: 0, y: 0, w: 6 },
        { i: 'c:GONE:1', x: 6, y: 0, w: 2 },
      ],
    };
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

  it('flows tiles in their order, each row as tall as its tallest tile', () => {
    const layout = [
      { i: 'b', x: 30, y: 0, w: 30, h: 20 },
      { i: 'a', x: 0, y: 0, w: 30, h: 10 },
      // A gap before it is closed
      { i: 'c', x: 30, y: 40, w: 30, h: 5 },
    ];
    expect(flowLayout(layout, 60).map(({ i, x, y }) => ({ i, x, y }))).toEqual([
      { i: 'b', x: 30, y: 0 },
      { i: 'a', x: 0, y: 0 },
      { i: 'c', x: 0, y: 20 },
    ]);
  });

  it('puts a dragged tile among the others in its row instead of pushing them down', () => {
    const row = [
      { i: 'a', x: 0, y: 0, w: 20, h: 10 },
      { i: 'b', x: 20, y: 0, w: 20, h: 10 },
      { i: 'c', x: 40, y: 0, w: 20, h: 10 },
    ];
    const at = (i: string, x: number, y: number) => {
      const out = flowLayout(
        row.map((t) => (t.i === i ? { ...t, x, y, moved: true } : t)),
        60,
      );
      return [...out].sort((p, q) => p.y - q.y || p.x - q.x).map((t) => `${t.i}${t.y}`);
    };
    // c dragged onto a: they swap places, b moves aside
    expect(at('c', 0, 0)).toEqual(['c0', 'a0', 'b0']);
    // a dragged a bit down onto c's place: still in the row
    expect(at('a', 38, 3)).toEqual(['b0', 'a0', 'c0']);
    // Below the last row: at the end, in the row where it still fits
    expect(at('a', 0, 12)).toEqual(['b0', 'c0', 'a0']);
  });

  it('stores positions and widths only, and reads them back', () => {
    const tiles = toSaved({ lg: [{ i: 'd:B', x: 1, y: 2, w: 3, h: 9 }] });
    expect(tiles).toEqual({ lg: [{ i: 'd:B', x: 1, y: 2, w: 3 }] });
    const saved = { v: 3, order: ['lights'], sections: { lights: tiles } };
    expect(parseLayout(JSON.stringify(saved))).toEqual(saved);
    expect(parseLayout('nonsense')).toBeNull();
    expect(parseLayout('')).toBeNull();
  });

  it('reads only the current version', () => {
    expect(parseLayout(JSON.stringify({ v: 2, order: ['climate'], sections: {} }))).toBeNull();
    expect(parseLayout(JSON.stringify({ v: 1, layouts: { lg: [] } }))).toBeNull();
  });

  it('orders sections as saved, new ones after them in their place', () => {
    const sections = ['climate', 'lights', 'blinds', 'sensors'].map((key) => ({ key }));
    expect(orderSections(sections, ['blinds', 'climate']).map((s) => s.key)).toEqual([
      'blinds',
      'climate',
      'lights',
      'sensors',
    ]);
    expect(orderSections(sections, []).map((s) => s.key)).toEqual(['climate', 'lights', 'blinds', 'sensors']);
  });

  it('moves a section up and down, not past the ends', () => {
    expect(moveSection(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveSection(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveSection(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveSection(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
  });
});

describe('arranged sections beside others', () => {
  // Two blinds of 300 px, arranged by hand side by side in a row of
  // 1347 px (1371 px with the grid's padding)
  const blinds = [
    { key: 'c:MA:1', minPx: 300 },
    { key: 'c:RA:4', minPx: 300 },
  ];
  const saved = {
    lg: [
      { i: 'c:RA:4', x: 0, y: 0, w: 15 },
      { i: 'c:MA:1', x: 15, y: 0, w: 15 },
    ],
  };

  it('picks the breakpoint as react-grid-layout does', () => {
    expect(breakpointFor(1371)).toBe('lg');
    expect(breakpointFor(1200)).toBe('md');
    expect(breakpointFor(390)).toBe('xxs');
  });

  it('counts the columns the tiles take from the left', () => {
    expect(usedColumns(blinds, saved, 1371)).toEqual({ cols: 60, used: 30 });
  });

  it('puts a new tile below, the section keeping its width', () => {
    const three = [...blinds, { key: 'c:NEW:1', minPx: 300 }];
    // The arranged row is 30 columns wide: the new one starts the next
    expect(usedColumns(three, saved, 1371)).toEqual({ cols: 60, used: 30 });
  });

  it('counts the tiles at their own width without a saved layout', () => {
    expect(usedColumns(blinds, undefined, 1371)).toEqual({ cols: 60, used: 30 });
  });

  it('measures columns as the grid lays them out', () => {
    // All columns: the whole row
    expect(columnsWidth(1371, 60, 60)).toBe(1347);
    // Half the columns: half the row without the gap in the middle
    expect(columnsWidth(1371, 60, 30)).toBe(668);
  });
});

describe('arranging as shown before', () => {
  // Pauls Jugendzimmer at 1395 px: a row of 1347 px (1371 px with the
  // grid's padding); two lights of 150 px at least, shown 170 px wide side
  // by side in a section of 352 px
  const lights = [
    { key: 'c:SA:2', minPx: 150 },
    { key: 'c:SAD:1', minPx: 150 },
  ];

  it('finds the columns closest to a width', () => {
    expect(columnsFor(352, 1371, 60)).toBe(16);
    expect(columnsFor(1347, 1371, 60)).toBe(60);
    expect(columnsFor(5, 1371, 60)).toBe(1);
  });

  it('gives tiles the width they had before arranging, side by side as there', () => {
    const layout = defaultLayout(lights, 'lg', 1371, 352);
    expect(layout).toEqual([
      { i: 'c:SA:2', x: 0, y: 0, w: 8 },
      { i: 'c:SAD:1', x: 8, y: 0, w: 8 },
    ]);
    // 8 columns are 169 px: as wide as the 170 px before, within half a column
    expect(Math.abs(columnsWidth(1371, 60, 8) - 170)).toBeLessThan(12);
  });

  it('counts the tracks the section shows, without those auto-fit drops', () => {
    // A phone of 600 px: two lights and a wide one (span 2) in 558 px. Three
    // tracks fit, but the wide one wraps and the third stays empty
    const tiles = [
      { key: 'c:A:1', minPx: 150 },
      { key: 'c:B:1', minPx: 150 },
      { key: 'c:C:1', minPx: 150, span: 2 },
    ];
    expect(flowTracks(tiles, 558)).toBe(2);
    // Each as wide as shown there: 273, 273 and 558 px (582 px with padding, xs)
    const layout = defaultLayout(tiles, 'xs', 582, 558);
    expect(layout.map((t) => [t.x, t.y, t.w])).toEqual([
      [0, 0, 10],
      [10, 0, 10],
      [0, 100, 20],
    ]);
    expect(columnsWidth(582, 20, 10)).toBe(273);
    // Three tracks when every one is filled
    expect(flowTracks([tiles[0], tiles[1], tiles[0]], 558)).toBe(3);
  });

  it('wraps where the section wrapped', () => {
    // Five lights in a section of 352 px: two per row
    const five = [1, 2, 3, 4, 5].map((n) => ({ key: `c:L:${n}`, minPx: 150 }));
    expect(defaultLayout(five, 'lg', 1371, 352).map((t) => [t.x, t.y])).toEqual([
      [0, 0],
      [8, 0],
      [0, 100],
      [8, 100],
      [0, 200],
    ]);
  });

  it('keeps the rows as arranged, within the section while arranging', () => {
    const arranged = [
      { i: 'a', x: 0, y: 0, w: 8, h: 1 },
      { i: 'b', x: 8, y: 0, w: 8, h: 1 },
      { i: 'c', x: 0, y: 5, w: 8, h: 1 },
    ];
    expect(widestRow(arranged)).toBe(16);
    expect(rowLimit(arranged, 60)).toBe(16);
    expect(flowLayout(arranged, rowLimit(arranged, 60)).map((t) => [t.x, t.y])).toEqual([
      [0, 0],
      [8, 0],
      [0, 1],
    ]);
  });
});
