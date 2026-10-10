import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { type RGB, WARM } from './PendantLamp';

const STEP = 5;

interface LevelBarProps {
  label: string;
  // 0..100
  value: number;
  onChange: (value: number) => void;
  color?: RGB;
}

// Brightness as a bar to drag or tap; the new value is sent once on
// release, arrow keys change it in 5 % steps. A vertical swipe scrolls the
// page (touch-pan-y) and sends nothing (pointercancel).
export const LevelBar = ({ label, value, onChange, color = WARM }: LevelBarProps) => {
  const bar = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const keyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (keyTimer.current) clearTimeout(keyTimer.current);
    },
    [],
  );
  const shown = drag ?? value;

  const at = (clientX: number) => {
    const rect = bar.current!.getBoundingClientRect();
    return Math.round((Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * 100) / STEP) * STEP;
  };
  const commit = (next: number) => {
    if (next !== value) onChange(next);
    setDrag(null);
  };
  const [r, g, b] = color;

  return (
    <div
      ref={bar}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shown}
      aria-valuetext={`${shown} %`}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag(at(event.clientX));
      }}
      onPointerMove={(event) => drag !== null && setDrag(at(event.clientX))}
      onPointerUp={() => drag !== null && commit(drag)}
      onPointerCancel={() => setDrag(null)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        const delta =
          event.key === 'ArrowRight' || event.key === 'ArrowUp'
            ? STEP
            : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
              ? -STEP
              : 0;
        if (!delta) return;
        event.preventDefault();
        const next = Math.max(0, Math.min(100, shown + delta));
        setDrag(next);
        if (keyTimer.current) clearTimeout(keyTimer.current);
        keyTimer.current = setTimeout(() => commit(next), 600);
      }}
      className="relative h-7 cursor-ew-resize touch-pan-y overflow-hidden rounded-full bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div
        className={cn('absolute inset-y-0 left-0 rounded-full', drag === null && 'transition-[width] duration-500')}
        style={{
          width: `${Math.max(shown, shown > 0 ? 14 : 0)}%`,
          background: `linear-gradient(90deg, rgba(${r},${g},${b},0.45), rgba(${r},${g},${b},0.95))`,
        }}
      />
      <span
        className={cn(
          'absolute inset-y-0 left-2.5 flex items-center text-xs font-semibold tabular-nums',
          shown > 0 ? 'text-black/75' : 'text-muted-foreground',
        )}
      >
        {shown} %
      </span>
    </div>
  );
};
