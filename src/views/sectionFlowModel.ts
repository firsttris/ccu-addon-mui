import type { CSSProperties } from 'react';

// Sections flow side by side, as words in a line: each as wide as its
// tiles at their narrowest, so that small ones (a thermostat, four lights)
// share a line instead of each taking one with most of it empty. They grow
// into what their line leaves, but by at most a fifth, about as wide as
// tiles come out in a grid across the whole page; the rest of the line
// stays empty rather than stretching a single tile.

// gap-3 between the tiles of a section's grid
const TILE_GAP = 12;
const MAX_GROWTH = 1.2;

// Columns of the section's grid its tiles take side by side (a wide tile
// spans two)
export const sectionColumns = (tiles: { span?: number }[]) => tiles.reduce((sum, tile) => sum + (tile.span ?? 1), 0);

// Width of a section with this many columns of at least minPx. A page too
// narrow for one more tile beside them (a phone) gets them across its whole
// width, as the grid did before: (threshold - 100%) * 1000 is huge there
// and below zero on wider pages, where the cap holds.
export const sectionFlex = (minPx: number, columns: number): CSSProperties => {
  const cols = Math.max(1, columns);
  const gaps = (cols - 1) * TILE_GAP;
  const basis = cols * minPx + gaps;
  const cap = Math.round(cols * minPx * MAX_GROWTH) + gaps;
  const threshold = basis + TILE_GAP + minPx;
  return {
    flex: `1 1 ${basis}px`,
    maxWidth: `min(100%, max(${cap}px, (${threshold}px - 100%) * 1000))`,
  };
};
