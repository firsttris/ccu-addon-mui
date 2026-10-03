import type { Layout, LayoutItem, ResponsiveLayouts } from 'react-grid-layout';

// Layout of the dashboard's tiles when arranged by hand: per breakpoint the
// position and width of each tile; the height follows the tile's content.
// Stored as JSON on the room, trade or favorite list in the CCU.

export const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 } as const;
export const COLS = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 } as const;
export type BreakpointName = keyof typeof BREAKPOINTS;
export const BREAKPOINT_NAMES = Object.keys(BREAKPOINTS) as BreakpointName[];

// Width of a column at each breakpoint, roughly (for default widths)
const COLUMN_PX: Record<BreakpointName, number> = { lg: 100, md: 100, sm: 128, xs: 120, xxs: 180 };

export const ROW_HEIGHT = 8;
export const MARGIN = 12;

export interface TileSpec {
  // "c:<channel address>" or "d:<device address>" (controls per device)
  key: string;
  // The narrowest the tile looks right, in pixels (as the section grids)
  minPx: number;
}

export interface SavedTile {
  i: string;
  x: number;
  y: number;
  w: number;
}

export interface SavedLayout {
  v: 1;
  layouts: Partial<Record<BreakpointName, SavedTile[]>>;
}

// Grid rows for a tile's height in pixels
export const rowsFor = (heightPx: number) => Math.max(1, Math.ceil((heightPx + MARGIN) / (ROW_HEIGHT + MARGIN)));

export const defaultWidth = (minPx: number, bp: BreakpointName) => Math.min(COLS[bp], Math.max(1, Math.ceil(minPx / COLUMN_PX[bp])));

// Tiles flowed left to right in their order, as the sections show them
export const defaultLayout = (tiles: TileSpec[], bp: BreakpointName): SavedTile[] => {
  const out: SavedTile[] = [];
  let x = 0;
  let row = 0;
  for (const tile of tiles) {
    const w = defaultWidth(tile.minPx, bp);
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

export const parseLayout = (json: string | undefined): SavedLayout | null => {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return parsed && parsed.v === 1 && typeof parsed.layouts === 'object' ? (parsed as SavedLayout) : null;
  } catch {
    return null;
  }
};

// The layouts to show: the saved positions of tiles that still exist, new
// tiles appended below, and every height from the measured content
export const responsiveLayouts = (
  tiles: TileSpec[],
  saved: SavedLayout | null,
  heights: Record<string, number>,
): ResponsiveLayouts<BreakpointName> => {
  const keys = new Set(tiles.map((t) => t.key));
  const result = {} as Record<BreakpointName, Layout>;
  for (const bp of BREAKPOINT_NAMES) {
    const stored = (saved?.layouts[bp] ?? []).filter((t) => keys.has(t.i));
    const placed = new Set(stored.map((t) => t.i));
    const missing = tiles.filter((t) => !placed.has(t.key));
    const appended = defaultLayout(missing, bp).map((t) => ({ ...t, y: t.y + 100000 }));
    const base = saved?.layouts[bp] ? [...stored, ...appended] : defaultLayout(tiles, bp);
    result[bp] = base.map(
      (t): LayoutItem => ({
        i: t.i,
        x: Math.min(t.x, COLS[bp] - 1),
        y: t.y,
        w: Math.min(Math.max(1, t.w), COLS[bp]),
        h: rowsFor(heights[t.i] ?? 160),
      }),
    );
  }
  return result;
};

// What is stored: position and width (heights come from the content)
export const toSaved = (layouts: Partial<Record<string, Layout>>): SavedLayout => ({
  v: 1,
  layouts: Object.fromEntries(
    Object.entries(layouts)
      .filter(([bp]) => bp in BREAKPOINTS)
      .map(([bp, layout]) => [bp, (layout ?? []).map(({ i, x, y, w }) => ({ i, x, y, w }))]),
  ),
});
