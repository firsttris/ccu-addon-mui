import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import GripIcon from '~icons/lucide/grip';
import PencilIcon from '~icons/lucide/pencil';
import { ResponsiveGridLayout, useContainerWidth } from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { cn } from '../../lib/utils';
import { m } from '../../paraglide/messages';
import {
  BREAKPOINTS,
  type BreakpointName,
  breakpointFor,
  COLS,
  columnsWidth,
  fitWithin,
  flowCompactorWithin,
  MARGIN,
  responsiveLayouts,
  ROW_HEIGHT,
  rowLimit,
  type SectionLayout,
  type TileSpec,
  toSaved,
  usedWidth,
} from './tileLayout';
import { SectionEdge } from './SectionEdge';

export interface GridTile extends TileSpec {
  element: ReactNode;
  // The channels the tile shows, for the order of a favorite list
  channelIds?: number[];
  // The name it shows: its channels can be given others
  name?: string;
}

// Measures a tile's natural height, which sets its height in the grid. The
// tile is at least as tall as its cell (as the others of its row) and grows
// with its content. It is measured without being stretched to its cell, so
// a cell still tall for a moment (the grid applies new heights a render
// later, e.g. when the bar above the tiles goes) isn't taken for its height.
const naturalHeight = (el: HTMLElement) => {
  const tile = el.firstElementChild as HTMLElement | null;
  if (!tile) return el.offsetHeight;
  const before = tile.style.minHeight;
  tile.style.minHeight = '0px';
  const height = tile.offsetHeight;
  tile.style.minHeight = before;
  return height;
};

const Measured = ({
  id,
  onHeight,
  children,
}: {
  id: string;
  onHeight: (id: string, h: number) => void;
  children: ReactNode;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => onHeight(id, naturalHeight(el));
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, [id, onHeight]);
  return (
    <div ref={ref} className="h-full [&>*]:min-h-full [&>*]:w-full">
      {children}
    </div>
  );
};

// Height of the bar above a tile while editing: its buttons (size-9) and a
// gap to the tile
const TOOLBAR = 44;

// The tiles of one section in a grid: arranged as saved, or by dragging them
// around and changing their width while editing
export const GridDashboard = ({
  tiles,
  saved,
  editing,
  onChange,
  equalRows = false,
  width: rowWidth,
  onRename,
  flowPx,
  edgeLabel,
  onFit,
}: {
  tiles: GridTile[];
  saved: SectionLayout | undefined;
  editing: boolean;
  onChange: (layout: SectionLayout) => void;
  equalRows?: boolean;
  // The width to lay the grid out for, that of the whole row (with the
  // padding): a section narrower than its row keeps the row's breakpoint
  // and columns, so the saved positions hold. Otherwise its own width.
  width?: number;
  // While editing: give a tile that shows one channel a name of its own
  onRename?: (tile: GridTile) => void;
  // While editing: the section's width as shown before, so its tiles keep
  // their width and wrap where they did
  flowPx?: number;
  // While editing: an edge to drag the section narrower or wider by, named
  // so; onFit follows once it was
  edgeLabel?: string;
  onFit?: () => void;
}) => {
  const measured = useContainerWidth();
  const { containerRef } = measured;
  const width = rowWidth ?? measured.width;
  const mounted = measured.mounted && width > 0;
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<SectionLayout | undefined>(saved);
  // The columns the tiles flow within while the edge is dragged
  const [preview, setPreview] = useState<number>();
  useEffect(() => setDraft(saved), [saved]);

  // The tiles' own heights, measured below the bar while editing
  const onHeight = useMemo(
    () => (id: string, h: number) => setHeights((prev) => (prev[id] === h ? prev : { ...prev, [id]: h })),
    [],
  );
  // After anything that can make tiles lower (width, arrangement), all are
  // measured again
  // biome-ignore lint/correctness/useExhaustiveDependencies: width and draft are the triggers, see above
  useEffect(() => setHeights({}), [width, draft]);
  const shownFlow = editing ? flowPx : undefined;
  // While editing, a bar above each tile holds its buttons (TOOLBAR), so
  // they cover nothing of it: the cell grows by the bar
  const cellHeights = useMemo(
    () => (editing ? Object.fromEntries(tiles.map((tile) => [tile.key, (heights[tile.key] ?? 0) + TOOLBAR])) : heights),
    [editing, heights, tiles],
  );
  const arranged = useMemo(
    () => responsiveLayouts(tiles, draft, cellHeights, width, equalRows, shownFlow),
    [tiles, draft, cellHeights, width, equalRows, shownFlow],
  );
  // From the width, as the grid picks it: its onBreakpointChange only
  // reports a change, not the breakpoint it starts with
  const breakpoint = breakpointFor(width);
  // The tiles wrap within the section, not the whole row
  const limit = preview ?? rowLimit(arranged[breakpoint] ?? [], COLS[breakpoint]);
  const compactor = useMemo(() => flowCompactorWithin(limit), [limit]);
  const shown = useMemo(() => fitWithin(arranged[breakpoint] ?? [], limit), [arranged, breakpoint, limit]);
  const layouts = useMemo(
    () => (preview === undefined ? arranged : { ...arranged, [breakpoint]: shown }),
    [arranged, breakpoint, preview, shown],
  );
  // Only what the user moved or resized is kept, for the breakpoint shown
  const commit = (layout: Layout) => {
    const next: SectionLayout = { ...draft, ...toSaved({ [breakpoint]: layout }) };
    setDraft(next);
    onChange(next);
  };
  const fit = (columns: number) => {
    commit(fitWithin(arranged[breakpoint] ?? [], columns));
    onFit?.();
  };

  return (
    <div
      ref={containerRef}
      className={cn('-mx-3', editing && 'relative rounded-2xl outline-2 outline-dashed outline-primary/30')}
      // While editing, the frame ends where the tiles do (and will, while
      // the edge is dragged): the section keeps its width from before, which
      // whole grid columns rarely fill exactly
      style={
        editing && rowWidth !== undefined
          ? { width: columnsWidth(width, COLS[breakpoint], usedWidth(shown)) + 2 * MARGIN }
          : undefined
      }
    >
      {mounted && (
        <ResponsiveGridLayout<BreakpointName>
          width={width}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          layouts={layouts}
          rowHeight={ROW_HEIGHT}
          margin={[MARGIN, MARGIN]}
          // Sideways only, balanced by -mx-3: the tiles stay where they are
          // when arranging starts
          containerPadding={[MARGIN, 0]}
          compactor={compactor}
          // Only the grip starts a drag: elsewhere a touch scrolls the page,
          // on a tablet the tiles cover most of it
          dragConfig={{ enabled: editing, handle: '.tile-drag-handle' }}
          resizeConfig={{ enabled: editing, handles: ['e'] }}
          onDragStop={(layout: Layout) => commit(layout)}
          onResizeStop={(layout: Layout) => commit(layout)}
        >
          {tiles.map((tile) => (
            <div key={tile.key} data-tile-key={tile.key} className="flex flex-col">
              {editing && (
                <div className="flex shrink-0 items-start justify-end gap-1" style={{ height: TOOLBAR }}>
                  {onRename && tile.name !== undefined && (
                    <button
                      type="button"
                      aria-label={m.TILE_RENAME({ name: tile.name })}
                      title={m.TILE_RENAME({ name: tile.name })}
                      onClick={() => onRename(tile)}
                      className="flex size-9 items-center justify-center rounded-xl border border-border bg-background/80 text-foreground shadow-sm backdrop-blur-sm hover:bg-accent"
                    >
                      <PencilIcon className="size-4" />
                    </button>
                  )}
                  <div
                    aria-hidden
                    className="tile-drag-handle flex size-9 cursor-move touch-none items-center justify-center rounded-xl border border-border bg-background/80 text-foreground shadow-sm backdrop-blur-sm"
                  >
                    <GripIcon className="size-5" />
                  </div>
                </div>
              )}
              <div className="relative min-h-0 flex-1">
                <Measured id={tile.key} onHeight={onHeight}>
                  {tile.element}
                </Measured>
                {/* While editing, a tap must not operate the tile */}
                {editing && <div aria-hidden className="absolute inset-0 rounded-2xl bg-primary/5" />}
              </div>
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
      {mounted && editing && edgeLabel && (
        <SectionEdge
          label={edgeLabel}
          gridRef={containerRef}
          width={width}
          cols={COLS[breakpoint]}
          layout={shown}
          onPreview={setPreview}
          onFit={fit}
        />
      )}
    </div>
  );
};
