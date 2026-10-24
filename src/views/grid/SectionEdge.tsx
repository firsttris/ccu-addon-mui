import { type KeyboardEvent, type PointerEvent, type RefObject, useRef } from 'react';
import type { Layout } from 'react-grid-layout';
import { limitAt, MARGIN, usedWidth } from './tileLayout';

// The right edge of a section while arranging: dragged to the left, its
// tiles wrap sooner (two side by side instead of four) and the section gets
// narrower; dragged to the right, wider. While dragging the tiles show
// where they will go (onPreview), on letting go they are placed (onFit).
export const SectionEdge = ({
  label,
  gridRef,
  width,
  cols,
  layout,
  onPreview,
  onFit,
}: {
  label: string;
  // The element the grid is laid out in, its first column MARGIN from the left
  gridRef: RefObject<HTMLElement | null>;
  // The width the grid is laid out for, and its columns
  width: number;
  cols: number;
  layout: Layout;
  onPreview: (limit: number | undefined) => void;
  onFit: (limit: number) => void;
}) => {
  // While the pointer is down; the columns once it moved
  const dragging = useRef<{ limit?: number } | undefined>(undefined);
  const at = (clientX: number) => {
    const left = gridRef.current?.getBoundingClientRect().left ?? 0;
    return limitAt(clientX - left - MARGIN, width, cols, layout);
  };
  const move = (event: PointerEvent) => {
    if (!dragging.current) return;
    dragging.current.limit = at(event.clientX);
    onPreview(dragging.current.limit);
  };
  const end = () => {
    const limit = dragging.current?.limit;
    dragging.current = undefined;
    onPreview(undefined);
    if (limit !== undefined) onFit(limit);
  };
  // By keyboard a tile narrower or wider at a time
  const step = Math.max(1, Math.min(...layout.map((t) => t.w)));
  const used = usedWidth(layout);
  const key = (event: KeyboardEvent) => {
    const delta = { ArrowLeft: -step, ArrowRight: step }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    onFit(Math.max(1, Math.min(cols, used + delta)));
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: an <hr> can't be dragged or focused; a separator with a value is the ARIA pattern for a splitter
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={step}
      aria-valuemax={cols}
      aria-valuenow={used}
      tabIndex={0}
      title={label}
      data-section-edge
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragging.current = {};
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={key}
      className="group absolute top-0 -right-3 bottom-0 z-10 flex w-6 cursor-ew-resize touch-none items-center justify-center focus-visible:outline-none"
    >
      <span className="h-12 w-1.5 rounded-full bg-primary/40 group-hover:bg-primary group-focus-visible:bg-primary group-active:bg-primary" />
    </div>
  );
};
