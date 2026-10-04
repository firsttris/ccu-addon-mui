import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
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

// Measures a tile's natural height, which sets its height in the grid
const Measured = ({ id, onHeight, children }: { id: string; onHeight: (id: string, h: number) => void; children: ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => onHeight(id, el.offsetHeight));
    observer.observe(el);
    onHeight(id, el.offsetHeight);
    return () => observer.disconnect();
  }, [id, onHeight]);
  return (
    <div ref={ref} className="[&>*]:w-full">
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
}: {
  tiles: GridTile[];
  saved: SectionLayout | undefined;
  editing: boolean;
  onChange: (layout: SectionLayout) => void;
}) => {
  const { width, containerRef, mounted } = useContainerWidth();
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<SectionLayout | undefined>(saved);
  useEffect(() => setDraft(saved), [saved]);

  const onHeight = useMemo(
    () => (id: string, h: number) => setHeights((prev) => (prev[id] === h ? prev : { ...prev, [id]: h })),
    [],
  );
  const layouts = useMemo(() => responsiveLayouts(tiles, draft, heights), [tiles, draft, heights]);
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
          dragConfig={{ enabled: editing }}
          resizeConfig={{ enabled: editing, handles: ['e'] }}
          onBreakpointChange={(bp: BreakpointName) => setBreakpoint(bp)}
          onDragStop={(layout: Layout) => commit(layout)}
          onResizeStop={(layout: Layout) => commit(layout)}
        >
          {tiles.map((tile) => (
            <div key={tile.key} data-tile-key={tile.key} className={cn('relative', editing && 'cursor-move')}>
              <Measured id={tile.key} onHeight={onHeight}>
                {tile.element}
              </Measured>
              {/* While editing, dragging must not operate the tile */}
              {editing && <div aria-hidden className="absolute inset-0 rounded-2xl bg-primary/5" />}
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
    </div>
  );
};
