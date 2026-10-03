import { useEffect, useRef, useState } from 'react';
import { Channel, DatapointValue } from '../types/types';
import { useSetDataPoint } from '../queries';
import { Tile } from '../components/Tile';
import { useEffects } from '../contexts/EffectsContext';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';

const LONG_MS = 500;

// Names of the keys without what they all share (usually the device name)
export const keyLabels = (names: string[]): { title: string; labels: string[] } => {
  if (names.length < 2) return { title: names[0] ?? '', labels: names };
  let prefix = names[0];
  for (const name of names) {
    while (!name.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  // Only cut at a word boundary
  const cut = prefix.lastIndexOf(' ') + 1;
  const title = names[0].slice(0, cut).trim();
  return {
    title: title || names[0],
    labels: names.map((name) => name.slice(cut).trim() || name),
  };
};

const Key = ({ channel, label }: { channel: Channel; label: string }) => {
  const setDataPoint = useSetDataPoint();
  const effects = useEffects();
  const [held, setHeld] = useState(0);
  const [flash, setFlash] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef<number | null>(null);
  const longSent = useRef(false);
  const start = useRef<number | null>(null);

  // Pressed at the device: the CCU reports PRESS_SHORT/PRESS_LONG
  const dp = channel.datapoints as Record<string, DatapointValue>;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (dp.PRESS_SHORT === true || dp.PRESS_LONG === true) setFlash((f) => f + 1);
  }, [dp]);

  const press = (datapoint: 'PRESS_SHORT' | 'PRESS_LONG') =>
    setDataPoint(channel.interfaceName, channel.address, datapoint, true);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    timer.current = null;
    frame.current = null;
    start.current = null;
    setHeld(0);
  };
  useEffect(() => clear, []);

  const down = () => {
    if (start.current !== null) return;
    longSent.current = false;
    start.current = performance.now();
    const tick = (now: number) => {
      if (start.current === null) return;
      setHeld(Math.min(1, (now - start.current) / LONG_MS));
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    timer.current = setTimeout(() => {
      longSent.current = true;
      press('PRESS_LONG');
      setFlash((f) => f + 1);
    }, LONG_MS);
  };
  const up = (send: boolean) => {
    if (start.current === null) return;
    if (send && !longSent.current) {
      press('PRESS_SHORT');
      setFlash((f) => f + 1);
    }
    clear();
  };

  return (
    <button
      type="button"
      aria-label={`${label}: ${m.PRESS_HINT()}`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        down();
      }}
      onPointerUp={() => up(true)}
      onPointerCancel={() => up(false)}
      onKeyDown={(event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
          event.preventDefault();
          down();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') up(true);
      }}
      onContextMenu={(event) => event.preventDefault()}
      className="press group relative flex h-16 touch-none flex-col items-center justify-center overflow-hidden rounded-xl border bg-gradient-to-b from-background to-muted/60 px-2 text-center shadow-[inset_0_-2px_0_rgba(0,0,0,0.06)] select-none active:shadow-none dark:shadow-[inset_0_-2px_0_rgba(0,0,0,0.4)]"
    >
      {/* Light that flashes on each press, here or at the device */}
      {flash > 0 && (
        <span
          key={effects.on ? flash : 0}
          aria-hidden
          className={cn('pointer-events-none absolute inset-0 rounded-xl bg-sky-400/25', effects.on ? 'fx-flash' : 'opacity-0')}
        />
      )}
      {/* Fills while held, towards the long press */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-sky-500/20"
        style={{ height: `${held * 100}%` }}
      />
      <span className="mb-1 h-1 w-6 rounded-full bg-muted-foreground/30 transition-colors group-active:bg-sky-500" aria-hidden />
      <span className="relative line-clamp-2 text-[13px] leading-tight font-medium">{label}</span>
    </button>
  );
};

// The keys of a push button, remote or the CCU's virtual keys: tap for a
// short press, hold for a long one (what they do is set in programs and
// direct links). Presses at the device light up the key.
export const ButtonsControl = ({ channels }: { channels: Channel[] }) => {
  const keys = [...channels].sort((a, b) => a.address.localeCompare(b.address, undefined, { numeric: true }));
  const { title, labels } = keyLabels(keys.map((c) => c.name));
  return (
    <Tile status={keys[0]?.status} role="group" aria-label={title}>
      <div className="flex flex-col gap-3 p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="line-clamp-2 text-[15px] leading-snug font-medium" title={title}>
            {title}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{m.HOLD_FOR_LONG()}</span>
        </div>
        <div className={cn('grid gap-2', keys.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
          {keys.map((channel, i) => (
            <Key key={channel.address} channel={channel} label={labels[i]} />
          ))}
        </div>
      </div>
    </Tile>
  );
};
