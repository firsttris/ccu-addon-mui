import { getBreakpointFromWidth } from 'react-grid-layout';
import type { Compactor, Layout, LayoutItem, ResponsiveLayouts } from 'react-grid-layout';

// Layout of the dashboard's tiles when arranged by hand. Every section
// (lights, heating, ...) is a grid of its own: tiles move within it, and the
// sections themselves can be reordered. Per breakpoint the position and
// width of each tile; the height follows the tile's content. Stored as JSON
// on the room, trade or favorite list in the CCU.

export const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 } as const;
// Fine columns, so that tiles can be as wide as in the sections' own grids:
// five side by side need a multiple of five (12 columns only fit 4 or 6)
export const COLS = { lg: 60, md: 50, sm: 30, xs: 20, xxs: 10 } as const;
export type BreakpointName = keyof typeof BREAKPOINTS;
const BREAKPOINT_NAMES = Object.keys(BREAKPOINTS) as BreakpointName[];

export const ROW_HEIGHT = 8;
export const MARGIN = 12;

export interface TileSpec {
  // "c:<channel address>" or "d:<device address>" (controls per device)
  key: string;
  // The narrowest the tile looks right, in pixels (as the section grids)
  minPx: number;
  // Columns of the section grid it spans (col-span-2)
  span?: number;
}

export interface SavedTile {
  i: string;
  x: number;
  y: number;
  w: number;
}

// One section's tiles per breakpoint
export type SectionLayout = Partial<Record<BreakpointName, SavedTile[]>>;

export interface SavedLayout {
  v: 3;
  // Section keys in the order shown; sections not listed follow
  order: string[];
  sections: Record<string, SectionLayout>;
}

// Grid rows for a tile's height in pixels
export const rowsFor = (heightPx: number) => Math.max(1, Math.ceil((heightPx + MARGIN) / (ROW_HEIGHT + MARGIN)));

// As wide as in the section's own grid (auto-fill, minmax(minPx, 1fr)): as
// many tiles side by side as fit into the grid's width (the container's,
// without its padding), sharing the columns
export const defaultWidth = (minPx: number, bp: BreakpointName, widthPx: number, span = 1) => {
  const perRow = Math.max(1, Math.floor((widthPx - 2 * MARGIN + MARGIN) / (minPx + MARGIN)));
  return Math.min(COLS[bp], span * Math.max(1, Math.floor(COLS[bp] / Math.min(perRow, COLS[bp]))));
};

// Columns of a grid widthPx wide (its padding outside, as GridDashboard's
// -mx-3 puts it) that come closest to px
export const columnsFor = (px: number, widthPx: number, cols: number) => {
  const column = (widthPx - 2 * MARGIN - MARGIN * (cols - 1)) / cols;
  return Math.max(1, Math.min(cols, Math.round((px + MARGIN) / (column + MARGIN))));
};

// The tracks a section's grid (auto-fit, minmax(minPx, 1fr)) shows in
// flowPx: as many as fit, less those no tile fills, which auto-fit drops
// (a wide tile wrapping leaves the last one empty). Its tiles placed in
// order, as the grid does without dense packing.
export const flowTracks = (tiles: TileSpec[], flowPx: number) => {
  const minPx = Math.min(...tiles.map((t) => t.minPx));
  const fit = Math.max(1, Math.floor((flowPx + MARGIN) / (minPx + MARGIN)));
  let col = 0;
  let used = 1;
  for (const tile of tiles) {
    const span = Math.min(tile.span ?? 1, fit);
    if (col + span > fit) col = 0;
    col += span;
    used = Math.max(used, col);
  }
  return used;
};

// Tiles flowed left to right in their order, as the sections show them:
// across the whole row, or with flowPx as in the section flowPx wide, each
// as wide as a track there (in columns of the grid of the whole row) and
// wrapping where it wrapped
export const defaultLayout = (tiles: TileSpec[], bp: BreakpointName, widthPx: number, flowPx?: number): SavedTile[] => {
  const out: SavedTile[] = [];
  const tracks = flowPx === undefined || tiles.length === 0 ? 0 : flowTracks(tiles, flowPx);
  const track = tracks && Math.max(1, Math.floor(columnsFor(flowPx ?? 0, widthPx, COLS[bp]) / tracks));
  const limit = tracks ? tracks * track : COLS[bp];
  let x = 0;
  let row = 0;
  for (const tile of tiles) {
    const w = tracks
      ? Math.min(limit, track * Math.min(tile.span ?? 1, tracks))
      : defaultWidth(tile.minPx, bp, widthPx, tile.span);
    if (x > 0 && x + w > limit) {
      x = 0;
      row += 1;
    }
    // Sparse rows: the vertical compaction packs them, keeping the order
    out.push({ i: tile.key, x, y: row * 100, w });
    x += w;
  }
  return out;
};

// Stored by the server in mui-tiles.json, from version 3 on (older ones
// were ReGa metadata and are not read)
export const parseLayout = (json: string | undefined): SavedLayout | null => {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (parsed?.v !== 3 || !Array.isArray(parsed.order) || !parsed.sections || typeof parsed.sections !== 'object')
      return null;
    return parsed as SavedLayout;
  } catch {
    return null;
  }
};

// The layouts to show: the saved positions of tiles that still exist, new
// tiles appended below, and every height from the measured content. Only
// the layout of the breakpoint that widthPx falls into is shown, so new
// tiles get their width from it.
export const responsiveLayouts = (
  tiles: TileSpec[],
  saved: SectionLayout | undefined,
  heights: Record<string, number>,
  widthPx: number,
  // Tiles starting in the same row get the height of the tallest, as in
  // the sections' own grids
  equalRows = false,
  // The section's width as shown before arranging: tiles not arranged yet
  // keep their width from there (defaultLayout)
  flowPx?: number,
): ResponsiveLayouts<BreakpointName> => {
  const keys = new Set(tiles.map((t) => t.key));
  const result = {} as Record<BreakpointName, Layout>;
  for (const bp of BREAKPOINT_NAMES) {
    const stored = (saved?.[bp] ?? []).filter((t) => keys.has(t.i));
    const placed = new Set(stored.map((t) => t.i));
    const missing = tiles.filter((t) => !placed.has(t.key));
    const appended = defaultLayout(missing, bp, widthPx, flowPx).map((t) => ({ ...t, y: t.y + 100000 }));
    const base = saved?.[bp] ? [...stored, ...appended] : defaultLayout(tiles, bp, widthPx, flowPx);
    const rowHeight = new Map<number, number>();
    if (equalRows) {
      for (const t of base) rowHeight.set(t.y, Math.max(rowHeight.get(t.y) ?? 0, heights[t.i] ?? 0));
    }
    result[bp] = base.map(
      (t): LayoutItem => ({
        i: t.i,
        x: Math.min(t.x, COLS[bp] - 1),
        y: t.y,
        w: Math.min(Math.max(1, t.w), COLS[bp]),
        h: rowsFor((equalRows ? rowHeight.get(t.y) : heights[t.i]) ?? 0),
      }),
    );
  }
  return result;
};

// Tiles flow left to right in their order and wrap at the edge, as in the
// sections' own grids; each row is as tall as its tallest tile. A tile
// dragged onto others takes its place among them (they move aside in the
// row) instead of pushing them down: it goes before the first tile whose
// middle is not left of its own, in the row its middle is over.
// (react-grid-layout's wrapCompactor makes every row one grid row tall.)
export const flowLayout = (layout: Layout, cols: number): Layout => {
  const byPosition = (a: LayoutItem, b: LayoutItem) => a.y - b.y || a.x - b.x;
  const order = layout.filter((t) => !t.moved).sort(byPosition);
  for (const dragged of layout.filter((t) => t.moved)) {
    const cx = dragged.x + dragged.w / 2;
    const cy = dragged.y + dragged.h / 2;
    const at = order.findIndex((t) => t.y > cy || (cy < t.y + t.h && t.x + t.w / 2 >= cx));
    order.splice(at < 0 ? order.length : at, 0, dragged);
  }
  const placed = new Map<string, LayoutItem>();
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const t of order) {
    const w = Math.min(t.w, cols);
    if (x > 0 && x + w > cols) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    placed.set(t.i, { ...t, x, y, w, moved: false });
    x += w;
    rowHeight = Math.max(rowHeight, t.h);
  }
  return layout.map((t) => placed.get(t.i) ?? t);
};

// Overlapping while dragging: nothing is pushed away, flowLayout puts every
// tile in its place
export const flowCompactor: Compactor = {
  type: 'wrap',
  allowOverlap: true,
  compact: flowLayout,
};

// The columns of the widest row (tiles with the same y): what tiles flowed
// within it make again the same rows, as an arrangement was made in a
// section that wide
export const widestRow = (layout: readonly { y: number; w: number }[]) => {
  const rows = new Map<number, number>();
  for (const t of layout) rows.set(t.y, (rows.get(t.y) ?? 0) + t.w);
  return Math.max(1, ...rows.values());
};

// Tiles flow within limit columns, the section's width, instead of the
// whole row; a tile wider than that widens it
export const flowCompactorWithin = (limit: number): Compactor => ({
  type: 'wrap',
  allowOverlap: true,
  compact: (layout: Layout, cols: number) =>
    flowLayout(layout, Math.min(cols, Math.max(limit, ...layout.map((t) => t.w)))),
});

// The columns tiles flow within: the widest row, so the rows stay as
// arranged, or as the section showed them before arranging (defaultLayout
// with flowPx)
export const rowLimit = (layout: Layout, cols: number) => Math.min(cols, widestRow(layout));

// The breakpoint a grid this wide shows, as react-grid-layout picks it
export const breakpointFor = (widthPx: number) => getBreakpointFromWidth(BREAKPOINTS, widthPx) as BreakpointName;

// Columns an arranged section's tiles take from the left, in the grid of a
// whole row (widthPx as passed to the grid): a section needs no more than
// that beside the others. While arranging with flowPx, as GridDashboard
// lays them out then.
export const usedColumns = (tiles: TileSpec[], saved: SectionLayout | undefined, widthPx: number, flowPx?: number) => {
  const bp = breakpointFor(widthPx);
  const layout = responsiveLayouts(tiles, saved, {}, widthPx, false, flowPx)[bp] ?? [];
  const placed = flowLayout(layout, rowLimit(layout, COLS[bp]));
  return { cols: COLS[bp], used: usedWidth(placed) };
};

// Width of the first `used` of `cols` columns in a grid widthPx wide; its
// padding (MARGIN on each side) is outside, as GridDashboard's -mx-3 puts it
export const columnsWidth = (widthPx: number, cols: number, used: number) => {
  const column = (widthPx - 2 * MARGIN - MARGIN * (cols - 1)) / cols;
  return Math.ceil(used * column + (used - 1) * MARGIN);
};

// What is stored: position and width (heights come from the content)
export const toSaved = (layouts: Partial<Record<string, Layout>>): SectionLayout =>
  Object.fromEntries(
    Object.entries(layouts)
      .filter(([bp]) => bp in BREAKPOINTS)
      .map(([bp, layout]) => [bp, (layout ?? []).map(({ i, x, y, w }) => ({ i, x, y, w }))]),
  );

// The sections in the saved order; new ones keep their place after it
export const orderSections = <T extends { key: string }>(sections: T[], order: string[]): T[] => {
  const rank = (key: string) => {
    const i = order.indexOf(key);
    return i < 0 ? order.length : i;
  };
  return sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) => rank(a.section.key) - rank(b.section.key) || a.index - b.index)
    .map(({ section }) => section);
};

// Moves a section up (-1) or down (+1)
export const moveSection = (keys: string[], key: string, delta: -1 | 1): string[] => {
  const from = keys.indexOf(key);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= keys.length) return keys;
  const next = [...keys];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
};

// Columns a section's tiles flow within when its edge is dragged to px
// (from the left of its first column, in a grid widthPx wide): the nearest
// column, but no narrower than its widest tile
export const limitAt = (px: number, widthPx: number, cols: number, layout: readonly { w: number }[]) =>
  Math.min(cols, Math.max(columnsFor(px, widthPx, cols), ...layout.map((t) => t.w)));

// The tiles flowed again within limit columns, in their order: a section
// made narrower puts fewer side by side, one made wider more
export const fitWithin = (layout: Layout, limit: number): Layout =>
  flowLayout(
    layout.map((t) => ({ ...t, moved: false })),
    Math.max(limit, ...layout.map((t) => t.w)),
  );

// Columns the tiles take from the left
export const usedWidth = (layout: readonly { x: number; w: number }[]) =>
  layout.reduce((max, t) => Math.max(max, t.x + t.w), 1);

// The columns one step narrower (-1) or wider (+1) by keyboard: the
// nearest that puts the tiles in other rows, or undefined when none does
// (a wide tile can need more than one more column to move up)
export const nextLimit = (layout: Layout, cols: number, delta: -1 | 1) => {
  const used = usedWidth(layout);
  for (let limit = used + delta; limit >= 1 && limit <= cols; limit += delta) {
    const next = usedWidth(fitWithin(layout, limit));
    if (next !== used) return limit;
  }
  return undefined;
};
