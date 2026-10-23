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
  flowCompactor,
  MARGIN,
  responsiveLayouts,
  ROW_HEIGHT,
  type SectionLayout,
  type TileSpec,
  toSaved,
} from './tileLayout';

export interface GridTile extends TileSpec {
  element: ReactNode;
  // The channels the tile shows, for the order of a favorite list
  channelIds?: number[];
  // The name it shows, when it shows one channel: it can be given another
  name?: string;
}

// Measures a tile's natural height, which sets its height in the grid. The
// tile is at least as tall as its cell (as the others of its row) and grows
// with its content; measured while the cells are low (see reset below).
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
    const measure = () => onHeight(id, (el.firstElementChild as HTMLElement | null)?.offsetHeight ?? el.offsetHeight);
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
}) => {
  const measured = useContainerWidth();
  const { containerRef } = measured;
  const width = rowWidth ?? measured.width;
  const mounted = measured.mounted && width > 0;
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<SectionLayout | undefined>(saved);
  useEffect(() => setDraft(saved), [saved]);

  // While editing, a bar above each tile holds its buttons (TOOLBAR), so
  // they cover nothing of it: the cell grows by the bar
  const onHeight = useMemo(() => {
    const bar = editing ? TOOLBAR : 0;
    return (id: string, h: number) => setHeights((prev) => (prev[id] === h + bar ? prev : { ...prev, [id]: h + bar }));
  }, [editing]);
  // A tile stretched to its row keeps that height when measured; so after
  // anything that can make tiles lower (width, arrangement, the bar above
  // them going), all are measured again from low cells
  // biome-ignore lint/correctness/useExhaustiveDependencies: width, draft and editing are the triggers, see above
  useEffect(() => setHeights({}), [width, draft, editing]);
  const layouts = useMemo(
    () => responsiveLayouts(tiles, draft, heights, width, equalRows),
    [tiles, draft, heights, width, equalRows],
  );
  // From the width, as the grid picks it: its onBreakpointChange only
  // reports a change, not the breakpoint it starts with
  const breakpoint = breakpointFor(width);
  // Only what the user moved or resized is kept, for the breakpoint shown
  const commit = (layout: Layout) => {
    const next: SectionLayout = { ...draft, ...toSaved({ [breakpoint]: layout }) };
    setDraft(next);
    onChange(next);
  };

  return (
    <div
      ref={containerRef}
      className={cn('-mx-3', editing && 'rounded-2xl outline-2 outline-dashed outline-primary/30')}
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
          compactor={flowCompactor}
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
    </div>
  );
};
