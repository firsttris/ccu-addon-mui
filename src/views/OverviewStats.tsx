import { type CSSProperties, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import LightbulbIcon from '~icons/lucide/lightbulb';
import { useEffects } from '../contexts/EffectsContext';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';
import { formatNumber } from '../lib/format';

// The figures above the tiles, each with a small picture that moves like
// the tiles do: the thermometer rises, the bulb glows, the window opens.

// A number that runs to its new value instead of jumping (only on changes:
// the first value shows at once)
const useRunning = (value: number, ms = 700) => {
  const effects = useEffects();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (!effects.on || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const begin = from.current;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - t) ** 3;
      const current = begin + (value - begin) * eased;
      from.current = current;
      setShown(current);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, ms, effects.on]);
  return shown;
};

const Stat = ({
  index,
  picture,
  label,
  children,
}: {
  index: number;
  picture: ReactNode;
  label: string;
  children: ReactNode;
}) => {
  const effects = useEffects();
  return (
    <div
      className={cn(
        'tile-edge relative flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl border bg-card p-4',
        effects.on && 'fx-stat-in',
      )}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {picture}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="text-[13px] text-muted-foreground">{label}</div>
        {children}
      </div>
    </div>
  );
};

const PictureBox = ({
  background,
  className,
  children,
}: {
  background?: string;
  className?: string;
  children: ReactNode;
}) => (
  <div
    aria-hidden
    className={cn(
      'relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl transition-[background] duration-700',
      className,
    )}
    style={background ? { background } : undefined}
  >
    {children}
  </div>
);

// --- Indoor average: a thermometer filled to the temperature, from cold
// blue to warm orange

// 14 °C empty, 28 °C full
const warmth = (celsius: number) => Math.max(0, Math.min(1, (celsius - 14) / 14));
// The box around it: blue when cold, amber when comfortable, orange when warm
const climate = (celsius: number) =>
  celsius < 18 ? 'rgb(56 189 248 / 0.16)' : celsius <= 23 ? 'rgb(251 191 36 / 0.16)' : 'rgb(249 115 22 / 0.18)';

export const TemperatureStat = ({ index, average }: { index: number; average: number }) => {
  const effects = useEffects();
  const shown = useRunning(average);
  const mercury = useId();
  const fill = 0.15 + 0.75 * warmth(shown);
  return (
    <Stat
      index={index}
      label={m.INDOOR_AVERAGE()}
      picture={
        <PictureBox background={climate(shown)}>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <defs>
              <linearGradient id={mercury} x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#ef4444" />
                <stop offset="100%" stopColor="#fb923c" />
              </linearGradient>
            </defs>
            {/* The mercury: the column and the bulb */}
            <rect
              x="10.25"
              width="3.5"
              y={3.5 + 11 * (1 - fill)}
              height={11 * fill + 3}
              rx="1.75"
              fill={`url(#${mercury})`}
              className="transition-[y,height] duration-700 ease-out"
            />
            <circle cx="12" cy="17.5" r="3.2" fill="#ef4444" />
            {effects.on && (
              <circle
                cx="12"
                cy="17.5"
                r="3.2"
                fill="#ef4444"
                className="fx-breathe"
                style={{ filter: 'blur(2.5px)' }}
              />
            )}
            {/* The glass */}
            <path
              d="M14 14.76V3.5a2 2 0 0 0-4 0v11.26a4.5 4.5 0 1 0 4 0Z"
              stroke="currentColor"
              strokeWidth="1.8"
              className="text-foreground/70"
            />
          </svg>
        </PictureBox>
      }
    >
      <div className="truncate text-xl font-semibold tabular-nums">{formatNumber(shown, 1, 1)} °C</div>
    </Stat>
  );
};

// --- Lights: the bulb glows the more lights are on, a bar shows how many

export const LightsStat = ({ index, on, total }: { index: number; on: number; total: number }) => {
  const effects = useEffects();
  const share = total > 0 ? on / total : 0;
  // A light switched on: the bulb flickers up once
  const [flicker, setFlicker] = useState(0);
  const last = useRef(on);
  useEffect(() => {
    if (on > last.current) setFlicker((n) => n + 1);
    last.current = on;
  }, [on]);
  const segments = total <= 12;
  return (
    <Stat
      index={index}
      label={m.LIGHTS_ON()}
      picture={
        <PictureBox
          className={cn('text-amber-600 dark:text-amber-300', on > 0 ? 'bg-amber-400/20' : 'bg-amber-500/10')}
        >
          {effects.on && on > 0 && (
            <div
              className="absolute inset-0 transition-opacity duration-700"
              style={{
                background: 'radial-gradient(circle at 50% 40%, rgb(251 191 36 / 0.75), transparent 65%)',
                opacity: Math.min(1, (0.35 + 0.65 * share) * effects.k),
              }}
            />
          )}
          <span key={flicker} className={cn('relative flex', effects.on && flicker > 0 && 'fx-flicker')}>
            <LightbulbIcon
              className={cn(
                'size-5 transition-[fill] duration-500',
                on > 0 ? 'fill-amber-300/70 dark:fill-amber-300/40' : 'fill-transparent',
              )}
            />
          </span>
        </PictureBox>
      }
    >
      <div key={on} className={cn('truncate text-xl font-semibold tabular-nums', effects.on && 'fx-rise-a')}>
        {m.COUNT_OF({ count: on, total })}
      </div>
      {segments ? (
        <div aria-hidden className="mt-1 flex gap-1">
          {Array.from({ length: total }, (_, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: segments of a bar, nothing but their position
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-[background,box-shadow] duration-500',
                i < on ? 'bg-amber-400' : 'bg-muted',
                i < on && effects.on && 'shadow-[0_0_6px_rgb(251_191_36/0.7)]',
              )}
              style={{ transitionDelay: `${i * 40}ms` }}
            />
          ))}
        </div>
      ) : (
        <div aria-hidden className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-amber-400 transition-[width] duration-700 ease-out"
            style={{ width: `${share * 100}%` }}
          />
        </div>
      )}
    </Stat>
  );
};

// --- Windows: the window opens when one is open, and air comes in

// Text too long for its place moves slowly to its end and back
const Running = ({ text, className }: { text: string; className?: string }) => {
  const effects = useEffects();
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: measures again when the text changes
  useLayoutEffect(() => {
    const measure = () => {
      if (box.current && inner.current) setShift(Math.max(0, inner.current.scrollWidth - box.current.clientWidth));
    };
    measure();
    if (typeof ResizeObserver === 'undefined' || !box.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(box.current);
    return () => observer.disconnect();
  }, [text]);
  const moving = effects.on && shift > 0;
  return (
    <div
      ref={box}
      className={cn('overflow-hidden whitespace-nowrap', !moving && 'truncate', className)}
      style={
        moving
          ? { maskImage: 'linear-gradient(90deg, transparent, black 6px, black calc(100% - 10px), transparent)' }
          : undefined
      }
      title={text}
    >
      <span
        ref={inner}
        className={cn('inline-block', moving && 'fx-marquee')}
        style={
          moving ? ({ '--shift': `-${shift}px`, animationDuration: `${4 + shift / 25}s` } as CSSProperties) : undefined
        }
      >
        {text}
      </span>
    </div>
  );
};

export const WindowsStat = ({ index, open }: { index: number; open: string[] }) => {
  const effects = useEffects();
  const anyOpen = open.length > 0;
  const value = !anyOpen ? m.NONE() : open.length <= 2 ? open.join(', ') : String(open.length);
  return (
    <Stat
      index={index}
      label={m.WINDOWS_OPEN()}
      picture={
        <PictureBox
          className={cn(
            '[perspective:60px]',
            anyOpen
              ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
          )}
        >
          {/* Frame */}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="absolute size-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <rect x="4" y="3.5" width="16" height="17" rx="2" />
          </svg>
          {/* The sash, which opens inwards */}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="absolute size-6 origin-[30%_50%] transition-transform duration-700 ease-[cubic-bezier(.3,1.4,.5,1)]"
            style={{ transform: anyOpen ? 'rotateY(-62deg)' : 'none' }}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <rect
              x="7"
              y="6.5"
              width="10"
              height="11"
              rx="1"
              className={cn(anyOpen ? 'fill-blue-400/25' : 'fill-emerald-400/15')}
            />
            <path d="M14.5 12h1.5" strokeLinecap="round" />
          </svg>
          {/* Air coming in */}
          {effects.on &&
            anyOpen &&
            [9, 15].map((top, i) => (
              <span
                key={top}
                className="fx-breeze absolute left-0 h-[1.5px] w-3.5 rounded-full bg-current opacity-0"
                style={{ top, animationDelay: `${i * 1.1}s` }}
              />
            ))}
          {anyOpen && effects.on && (
            <span className="fx-wave absolute inset-0 rounded-xl border-2 border-blue-500/30" />
          )}
        </PictureBox>
      }
    >
      <Running key={value} text={value} className={cn('text-xl font-semibold', effects.on && 'fx-rise-a')} />
    </Stat>
  );
};
