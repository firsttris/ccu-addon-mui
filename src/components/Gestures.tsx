import { type ReactNode, useEffect, useRef, useState } from 'react';
import ChevronsRightIcon from '~icons/lucide/chevrons-right';
import { cn } from '../lib/utils';

// Deliberate gestures for actions a stray tap must not trigger (unlocking
// the front door while wiping the kitchen tablet). Both work with the
// keyboard too.

const HOLD_MS = 800;

interface HoldButtonProps {
  label: string;
  // Shown under the label while nothing happens, e.g. "Hold"
  hint?: string;
  icon: ReactNode;
  onConfirm: () => void;
  // Tailwind color of the filling ring, e.g. "text-amber-500"
  tone?: string;
  className?: string;
  disabled?: boolean;
}

// A button that has to be held for a moment; a ring fills while held.
// Space or Enter held down works the same.
export const HoldButton = ({
  label,
  hint,
  icon,
  onConfirm,
  tone = 'text-amber-500',
  className,
  disabled,
}: HoldButtonProps) => {
  const [progress, setProgress] = useState(0);
  const frame = useRef<number | null>(null);
  const start = useRef<number | null>(null);

  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    start.current = null;
    setProgress(0);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: cleanup on unmount only; stop reads refs
  useEffect(() => stop, []);

  const begin = () => {
    if (disabled || start.current !== null) return;
    start.current = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - (start.current ?? now)) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        stop();
        onConfirm();
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  const r = 15;
  const circumference = 2 * Math.PI * r;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        begin();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onKeyDown={(event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
          event.preventDefault();
          begin();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') stop();
      }}
      onContextMenu={(event) => event.preventDefault()}
      className={cn(
        'press flex h-12 touch-none items-center gap-3 rounded-xl border bg-background/60 px-3 text-left select-none hover:bg-accent disabled:opacity-50',
        className,
      )}
    >
      <span className="relative flex size-9 shrink-0 items-center justify-center">
        <svg aria-hidden viewBox="0 0 36 36" className="absolute inset-0 size-full -rotate-90">
          <circle cx="18" cy="18" r={r} fill="none" strokeWidth="2.5" className="stroke-muted" />
          <circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            stroke="currentColor"
            className={tone}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
          />
        </svg>
        <span className="relative flex [&_svg]:size-[18px]">{icon}</span>
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-medium">{label}</span>
        {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
};

interface SlideToConfirmProps {
  label: string;
  onConfirm: () => void;
  // Background of the filled part and the knob, e.g. "bg-amber-500"
  tone?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

// A knob that has to be pulled to the end of its track. Arrow keys move it
// in steps; the action runs when it reaches the end.
export const SlideToConfirm = ({ label, onConfirm, tone = 'bg-amber-500', icon, disabled }: SlideToConfirmProps) => {
  const track = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(0);
  const [dragging, setDragging] = useState(false);
  const grab = useRef(0);
  const KNOB = 44;

  const travel = () => Math.max(1, (track.current?.clientWidth ?? KNOB) - KNOB - 8);
  const confirm = () => {
    setPosition(1);
    onConfirm();
    setTimeout(() => setPosition(0), 700);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    grab.current = event.clientX - position * travel();
    setDragging(true);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setPosition(Math.max(0, Math.min(1, (event.clientX - grab.current) / travel())));
  };
  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (position > 0.88) {
      confirm();
    } else {
      setPosition(0);
    }
  };

  return (
    <div
      ref={track}
      className={cn(
        'relative h-[52px] touch-none overflow-hidden rounded-full border bg-muted/60 p-1 select-none',
        disabled && 'opacity-50',
      )}
    >
      <div
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-0 rounded-full opacity-25',
          tone,
          !dragging && 'transition-[width] duration-300',
        )}
        style={{ width: `calc(${position * 100}% + ${KNOB * (1 - position) + 4}px)` }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-3 left-[56px] flex items-center justify-center truncate text-[13px] font-medium text-muted-foreground"
        style={{ opacity: 1 - position * 1.6 }}
      >
        {label}
      </span>
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position * 100)}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            event.preventDefault();
            const next = Math.min(1, position + 0.34);
            if (next >= 1) confirm();
            else setPosition(next);
          } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'Escape') {
            event.preventDefault();
            setPosition(0);
          } else if (event.key === 'End') {
            event.preventDefault();
            confirm();
          }
        }}
        className={cn(
          'relative z-10 flex h-11 w-11 cursor-grab items-center justify-center rounded-full text-white shadow-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing [&_svg]:size-5',
          tone,
          !dragging && 'transition-transform duration-300 ease-[cubic-bezier(.3,.8,.2,1)]',
        )}
        style={{ transform: `translateX(${position * travel()}px)` }}
      >
        {icon ?? <ChevronsRightIcon />}
      </div>
    </div>
  );
};
