import { useEffect, useRef, useState } from 'react';
import { BlindVirtualReceiverChannel } from '../types/types';
import { useSetDataPoint } from '../queries';
import ChevronUpIcon from '~icons/lucide/chevron-up';
import ChevronDownIcon from '~icons/lucide/chevron-down';
import SquareIcon from '~icons/lucide/square';
import { Tile } from '../components/Tile';
import { useEffects } from '../contexts/EffectsContext';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';
import { LevelBar } from './light/LevelBar';

interface ControlProps {
  channel: BlindVirtualReceiverChannel;
}

const STEP = 5;

const button = 'press flex h-11 items-center justify-center rounded-xl border bg-background/60 hover:bg-accent [&_svg]:size-5';

// The window is a vertical slider: tap or drag anywhere in it to set the
// height. The shutter follows the pointer; the new level is sent once on
// release (one radio telegram instead of one per pixel). On a touch screen
// a tap sets the height and a swipe scrolls the page: the window lies in a
// scrolling page, a swipe across it must not move the shutter.
export const BlindsControl = ({ channel }: ControlProps) => {
  const setDataPoint = useSetDataPoint();
  const effects = useEffects();
  const { datapoints, name, address, interfaceName } = channel;
  // Rounded: e.g. 0.29 * 100 is 28.999999999999996 in floating point
  const level = Math.round(Number(datapoints.LEVEL) * 100);
  const [dragLevel, setDragLevel] = useState<number | null>(null);
  const shown = dragLevel ?? level;
  const windowRef = useRef<HTMLDivElement>(null);
  const keyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (keyTimer.current) clearTimeout(keyTimer.current);
  }, []);

  const send = (percent: number) => setDataPoint(interfaceName, address, 'LEVEL', percent / 100);

  const levelAt = (clientY: number) => {
    const rect = windowRef.current!.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return Math.round(((1 - fraction) * 100) / STEP) * STEP;
  };

  // A finger on the window: a tap if it lifts there, a scroll if the
  // browser takes over (pointercancel)
  const touchStart = useRef<number | null>(null);
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      touchStart.current = event.pointerId;
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragLevel(levelAt(event.clientY));
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragLevel !== null) setDragLevel(levelAt(event.clientY));
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (touchStart.current === event.pointerId) {
      touchStart.current = null;
      const tapped = levelAt(event.clientY);
      if (tapped !== level) send(tapped);
      return;
    }
    if (dragLevel !== null) {
      if (dragLevel !== level) send(dragLevel);
      setDragLevel(null);
    }
  };
  // Scrolling or an interrupted drag sends nothing
  const onPointerCancel = () => {
    touchStart.current = null;
    setDragLevel(null);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    const next =
      event.key === 'ArrowUp' || event.key === 'ArrowRight'
        ? Math.min(100, shown + STEP)
        : event.key === 'ArrowDown' || event.key === 'ArrowLeft'
          ? Math.max(0, shown - STEP)
          : event.key === 'Home'
            ? 100
            : event.key === 'End'
              ? 0
              : null;
    if (next === null) return;
    event.preventDefault();
    setDragLevel(next);
    if (keyTimer.current) clearTimeout(keyTimer.current);
    keyTimer.current = setTimeout(() => {
      send(next);
      setDragLevel(null);
    }, 600);
  };

  const open = shown / 100;
  const dragging = dragLevel !== null;
  // Slats of venetian blinds: HmIP LEVEL_2, BidCos JALOUSIE LEVEL_SLATS.
  // Roller shutters report LEVEL_2 empty (null), they get no slats.
  const dp = datapoints as unknown as Record<string, unknown>;
  const slatsKey = typeof dp.LEVEL_SLATS === 'number' ? 'LEVEL_SLATS' : typeof dp.LEVEL_2 === 'number' ? 'LEVEL_2' : null;
  const slats = slatsKey ? Math.round(Math.min(1, Math.max(0, Number(dp[slatsKey]))) * 100) : null;
  const status = shown === 0 ? m.BLIND_CLOSED() : shown === 100 ? m.BLIND_FULLY_OPEN() : m.BLIND_PERCENT_OPEN({ percent: shown });
  const a = (alpha: number) => Math.min(1, alpha * effects.k);

  return (
    <Tile status={channel.status}>
      <div className="flex gap-4 p-4">
        <div
          ref={windowRef}
          role="slider"
          tabIndex={0}
          aria-label={m.BLIND_POSITION({ name })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={shown}
          aria-valuetext={status}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onKeyDown={onKeyDown}
          className="relative min-h-[168px] w-32 shrink-0 self-stretch cursor-ns-resize touch-pan-y overflow-hidden rounded-[10px] border-[3px] border-zinc-400 bg-[linear-gradient(180deg,#bfe3fb_0%,#9fd2f5_55%,#86c3ee_100%)] transition-shadow duration-500 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:border-zinc-700 dark:bg-[linear-gradient(180deg,#2a4a6b_0%,#1a3350_55%,#142a40_100%)]"
          style={
            effects.on && shown > 0
              ? { boxShadow: `0 0 ${28 * effects.k}px -4px rgba(125,211,252,${a(0.35 * open)})` }
              : undefined
          }
        >
          {/* Daylight falling in, brighter the further open */}
          <div
            aria-hidden
            className="absolute inset-0 transition-opacity duration-500"
            style={{
              background: 'radial-gradient(120px 90px at 50% 100%, rgba(224,242,254,0.9), transparent 70%)',
              opacity: effects.on ? Math.min(1, 0.5 * open * effects.k) : 0.25 * open,
            }}
          />
          <div aria-hidden className="absolute inset-y-0 left-1/2 -ml-[1.5px] w-[3px] bg-zinc-400 dark:bg-zinc-700" />
          <div
            aria-hidden
            className={cn(
              'absolute inset-x-0 top-0 bg-[repeating-linear-gradient(180deg,#a1a1aa_0_2px,#8f8f98_2px_11px,#71717a_11px_13px)] dark:bg-[repeating-linear-gradient(180deg,#52525b_0_2px,#3f3f46_2px_11px,#27272a_11px_13px)]',
              !dragging && 'transition-[height] duration-700 ease-[cubic-bezier(.4,0,.2,1)]',
            )}
            style={{ height: `${100 - shown}%` }}
          >
            <div
              className="absolute inset-x-0 bottom-0 h-1 bg-zinc-500"
              style={
                effects.on && shown > 0 && shown < 100
                  ? { boxShadow: `0 4px ${14 * effects.k}px rgba(186,230,253,${a(0.45)})` }
                  : undefined
              }
            />
          </div>
          <div aria-hidden className="absolute inset-x-0 top-0 h-2 bg-zinc-400 dark:bg-zinc-700" />
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-2.5 left-1/2 rounded-full bg-black/70 px-2.5 py-0.5 text-[13px] font-semibold whitespace-nowrap text-white tabular-nums transition-transform duration-200"
            style={{ transform: `translateX(-50%) scale(${dragging ? 1.25 : 1})` }}
          >
            {shown} %
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
          <div className="min-w-0">
            <div className="line-clamp-2 min-h-[42px] text-[15px] leading-snug font-medium" title={name}>
              {name}
            </div>
            <div className="mt-0.5 text-[13px] text-muted-foreground">{status}</div>
            {slats !== null && slatsKey && (
              <details className="group mt-2">
                <summary className="w-fit cursor-pointer list-none rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-accent [&::-webkit-details-marker]:hidden">
                  {m.SLATS()} · {slats} %
                </summary>
                <div className="mt-2">
                  <LevelBar
                    label={m.SLATS_OF({ name })}
                    value={slats}
                    color={[148, 163, 184]}
                    onChange={(v) => setDataPoint(interfaceName, address, slatsKey, v / 100)}
                  />
                </div>
              </details>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <button className={button} onClick={() => send(100)} aria-label={m.BLIND_UP()} title={m.BLIND_UP()}>
              <ChevronUpIcon />
            </button>
            <button
              className={button}
              onClick={() => setDataPoint(interfaceName, address, 'STOP', true)}
              aria-label={m.BLIND_STOP()}
              title={m.BLIND_STOP()}
            >
              <SquareIcon className="!size-4 fill-current" />
            </button>
            <button className={button} onClick={() => send(0)} aria-label={m.BLIND_DOWN()} title={m.BLIND_DOWN()}>
              <ChevronDownIcon />
            </button>
          </div>
        </div>
      </div>
    </Tile>
  );
};
