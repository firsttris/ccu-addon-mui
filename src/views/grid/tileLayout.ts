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

// Tiles flowed left to right in their order, as the sections show them
export const defaultLayout = (tiles: TileSpec[], bp: BreakpointName, widthPx: number): SavedTile[] => {
  const out: SavedTile[] = [];
  let x = 0;
  let row = 0;
  for (const tile of tiles) {
    const w = defaultWidth(tile.minPx, bp, widthPx, tile.span);
    if (x + w > COLS[bp]) {
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
): ResponsiveLayouts<BreakpointName> => {
  const keys = new Set(tiles.map((t) => t.key));
  const result = {} as Record<BreakpointName, Layout>;
  for (const bp of BREAKPOINT_NAMES) {
    const stored = (saved?.[bp] ?? []).filter((t) => keys.has(t.i));
    const placed = new Set(stored.map((t) => t.i));
    const missing = tiles.filter((t) => !placed.has(t.key));
    const appended = defaultLayout(missing, bp, widthPx).map((t) => ({ ...t, y: t.y + 100000 }));
    const base = saved?.[bp] ? [...stored, ...appended] : defaultLayout(tiles, bp, widthPx);
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
