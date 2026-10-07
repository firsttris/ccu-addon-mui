import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import GripIcon from '~icons/lucide/grip';
import { ResponsiveGridLayout, useContainerWidth } from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { cn } from '../../lib/utils';
import { BREAKPOINTS, BreakpointName, COLS, MARGIN, responsiveLayouts, ROW_HEIGHT, SectionLayout, TileSpec, toSaved } from './tileLayout';

export interface GridTile extends TileSpec {
  element: ReactNode;
  // The channels the tile shows, for the order of a favorite list
  channelIds?: number[];
}

// Measures a tile's natural height, which sets its height in the grid. The
// tile is at least as tall as its cell (as the others of its row) and grows
// with its content; measured while the cells are low (see reset below).
const Measured = ({ id, onHeight, children }: { id: string; onHeight: (id: string, h: number) => void; children: ReactNode }) => {
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

// The tiles of one section in a grid: arranged as saved, or by dragging them
// around and changing their width while editing
export const GridDashboard = ({
  tiles,
  saved,
  editing,
  onChange,
  equalRows = false,
}: {
  tiles: GridTile[];
  saved: SectionLayout | undefined;
  editing: boolean;
  onChange: (layout: SectionLayout) => void;
  equalRows?: boolean;
}) => {
  const { width, containerRef, mounted } = useContainerWidth();
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<SectionLayout | undefined>(saved);
  useEffect(() => setDraft(saved), [saved]);

  const onHeight = useMemo(
    () => (id: string, h: number) => setHeights((prev) => (prev[id] === h ? prev : { ...prev, [id]: h })),
    [],
  );
  // A tile stretched to its row keeps that height when measured; so after
  // anything that can make tiles lower (width, arrangement), all are
  // measured again from low cells
  useEffect(() => setHeights({}), [width, draft]);
  const layouts = useMemo(() => responsiveLayouts(tiles, draft, heights, equalRows), [tiles, draft, heights, equalRows]);
  const [breakpoint, setBreakpoint] = useState<BreakpointName>('lg');
  // Only what the user moved or resized is kept, for the breakpoint shown
  const commit = (layout: Layout) => {
    const next: SectionLayout = { ...draft, ...toSaved({ [breakpoint]: layout }) };
    setDraft(next);
    onChange(next);
  };

  return (
    <div ref={containerRef} className={cn('-mx-3', editing && 'rounded-2xl outline-2 outline-dashed outline-primary/30')}>
      {mounted && (
        <ResponsiveGridLayout<BreakpointName>
          width={width}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          layouts={layouts}
          rowHeight={ROW_HEIGHT}
          margin={[MARGIN, MARGIN]}
          containerPadding={[MARGIN, MARGIN]}
          // Only the grip starts a drag: elsewhere a touch scrolls the page,
          // on a tablet the tiles cover most of it
          dragConfig={{ enabled: editing, handle: '.tile-drag-handle' }}
          resizeConfig={{ enabled: editing, handles: ['e'] }}
          onBreakpointChange={(bp: BreakpointName) => setBreakpoint(bp)}
          onDragStop={(layout: Layout) => commit(layout)}
          onResizeStop={(layout: Layout) => commit(layout)}
        >
          {tiles.map((tile) => (
            <div key={tile.key} data-tile-key={tile.key} className="relative">
              <Measured id={tile.key} onHeight={onHeight}>
                {tile.element}
              </Measured>
              {/* While editing, a tap must not operate the tile */}
              {editing && <div aria-hidden className="absolute inset-0 rounded-2xl bg-primary/5" />}
              {editing && (
                <div
                  aria-hidden
                  className="tile-drag-handle absolute right-2 top-2 flex size-9 cursor-move touch-none items-center justify-center rounded-xl border border-border bg-background/80 text-foreground shadow-sm backdrop-blur-sm"
                >
                  <GripIcon className="size-5" />
                </div>
              )}
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
    </div>
  );
};
