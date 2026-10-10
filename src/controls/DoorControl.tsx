import { useEffect, useRef, useState } from 'react';
import LockIcon from '~icons/lucide/lock';
import LockOpenIcon from '~icons/lucide/lock-open';
import DoorOpenIcon from '~icons/lucide/door-open';
import TriangleAlertIcon from '~icons/lucide/triangle-alert';
import type { Channel, DatapointValue, KeymaticChannel } from '../types/types';
import { useSetDataPoint } from '../queries';
import { Tile } from '../components/Tile';
import { HoldButton, SlideToConfirm } from '../components/Gestures';
import { useEffects } from '../contexts/EffectsContext';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';

export type LockState = 'locked' | 'unlocked' | 'unknown';

interface DoorViewProps {
  channel: Channel;
  state: LockState;
  // The drive is moving (HmIP-DLD)
  busy?: boolean;
  // Blocked bolt or another drive error
  error?: boolean;
  onLock: () => void;
  onUnlock: () => void;
  // Opens the latch; without it, there is no "slide to open"
  onOpen?: () => void;
}

// How long the door is drawn open after "open": the latch is pulled for a
// few seconds, there is no state for it.
const OPEN_MS = 4500;

const tones = {
  locked: { text: 'text-green-700 dark:text-green-300', glow: '34,197,94', ring: 'text-green-500' },
  unlocked: { text: 'text-amber-700 dark:text-amber-300', glow: '251,191,36', ring: 'text-amber-500' },
  unknown: { text: 'text-muted-foreground', glow: '161,161,170', ring: 'text-muted-foreground' },
};

// The door as a picture: the leaf swings open on "open", warm light falls
// through the gap, the bolt shows whether it is locked.
const DoorPicture = ({
  state,
  open,
  busy,
  error,
}: {
  state: LockState;
  open: boolean;
  busy?: boolean;
  error?: boolean;
}) => {
  const effects = useEffects();
  const a = (alpha: number) => Math.min(1, alpha * effects.k);
  const tone = tones[state];
  return (
    <div
      aria-hidden
      className="relative h-[176px] w-[96px] shrink-0 rounded-t-[14px] border-[3px] border-b-0 border-zinc-400 bg-zinc-900 [perspective:420px] dark:border-zinc-600"
    >
      {/* Light from inside, seen when the door opens */}
      <div
        className="absolute inset-0 rounded-t-[10px] transition-opacity duration-700"
        style={{
          background: 'linear-gradient(180deg, #fde68a 0%, #fbbf24 55%, #f59e0b 100%)',
          opacity: open ? 1 : 0,
        }}
      />
      {effects.on && (
        <div
          className="pointer-events-none absolute -inset-6 transition-opacity duration-700"
          style={{
            background: `radial-gradient(60% 55% at 50% 60%, rgba(251,191,36,${a(0.45)}), transparent 70%)`,
            opacity: open ? 1 : 0,
          }}
        />
      )}
      {/* The leaf, hinged on the left */}
      <div
        className={cn(
          'absolute inset-0 origin-left rounded-t-[10px] border-r border-black/20 bg-[linear-gradient(100deg,#e4e4e7_0%,#d4d4d8_55%,#c4c4cc_100%)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)] transition-transform duration-[900ms] ease-[cubic-bezier(.3,.7,.2,1)] dark:bg-[linear-gradient(100deg,#3f3f46_0%,#34343b_55%,#27272a_100%)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]',
        )}
        style={{ transform: open ? 'rotateY(-68deg)' : 'rotateY(0deg)' }}
      >
        {/* Panels */}
        <div className="absolute inset-x-3 top-3 h-[62px] rounded-md border border-black/10 bg-black/[0.03] dark:border-white/5 dark:bg-white/[0.02]" />
        <div className="absolute inset-x-3 top-[84px] bottom-3 rounded-md border border-black/10 bg-black/[0.03] dark:border-white/5 dark:bg-white/[0.02]" />
        {/* Handle */}
        <div className="absolute top-[86px] right-2.5 h-1.5 w-6 rounded-full bg-zinc-500 shadow-sm dark:bg-zinc-400" />
        <div className="absolute top-[84px] right-2.5 size-2.5 rounded-full bg-zinc-500 dark:bg-zinc-400" />
        {/* Lock cylinder, lit in the state's color */}
        <div
          className={cn(
            'absolute top-[100px] right-[11px] flex size-[18px] items-center justify-center rounded-full border-2 border-current bg-background transition-colors duration-500',
            tone.text,
            busy && effects.on && 'fx-pulse',
          )}
          style={
            effects.on && state !== 'unknown'
              ? { boxShadow: `0 0 ${10 * effects.k}px 1px rgba(${tone.glow},${a(0.55)})` }
              : undefined
          }
        >
          <div className="h-2 w-0.5 rounded-full bg-current" />
        </div>
        {error && (
          <div className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-500 text-white [&_svg]:size-4">
            <TriangleAlertIcon />
          </div>
        )}
      </div>
      {/* The bolt reaches into the frame when locked */}
      <div
        className={cn(
          'absolute top-[103px] -right-[5px] h-2 rounded-l-sm transition-[width,background-color] duration-500',
          state === 'locked' && !open ? 'w-[13px] bg-green-500' : 'w-[3px] bg-zinc-500',
        )}
        style={
          effects.on && state === 'locked' && !open
            ? { boxShadow: `0 0 ${8 * effects.k}px rgba(34,197,94,${a(0.6)})` }
            : undefined
        }
      />
      {/* Threshold */}
      <div className="absolute -inset-x-[3px] -bottom-1 h-1 rounded-full bg-zinc-400 dark:bg-zinc-600" />
    </div>
  );
};

// Locks and door openers: lock with a tap, unlock by holding, open by
// sliding, so a stray tap can't open the front door.
export const DoorView = ({ channel, state, busy, error, onLock, onUnlock, onOpen }: DoorViewProps) => {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const tone = tones[state];
  const status = error
    ? m.DOOR_ERROR()
    : open
      ? m.DOOR_OPENING()
      : busy
        ? m.DOOR_MOVING()
        : state === 'locked'
          ? m.LOCKED()
          : state === 'unlocked'
            ? m.UNLOCKED()
            : m.DOOR_STATE_UNKNOWN();

  const openDoor = () => {
    onOpen?.();
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), OPEN_MS);
  };

  return (
    <Tile status={channel.status} role="group" aria-label={channel.name}>
      <div className="flex gap-4 p-4">
        <DoorPicture state={state} open={open} busy={busy} error={error} />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-[15px] font-medium" title={channel.name}>
              {channel.name}
            </h3>
            <span
              role="status"
              className={cn(
                'mt-1 inline-flex items-center gap-1.5 text-[13px] font-medium',
                error ? 'text-red-600 dark:text-red-400' : open ? 'text-amber-700 dark:text-amber-300' : tone.text,
              )}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {status}
            </span>
          </div>
          <div className="mt-auto flex flex-col gap-2.5">
            {state === 'locked' ? (
              <HoldButton
                label={m.UNLOCK()}
                hint={m.HOLD_TO_CONFIRM()}
                icon={<LockOpenIcon />}
                tone="text-amber-500"
                disabled={busy}
                onConfirm={onUnlock}
              />
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={onLock}
                className="press flex h-12 items-center gap-3 rounded-xl border bg-background/60 px-3 text-left hover:bg-accent disabled:opacity-50"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-700 dark:text-green-300 [&_svg]:size-[18px]">
                  <LockIcon />
                </span>
                <span className="text-sm font-medium">{m.LOCK()}</span>
              </button>
            )}
            {onOpen && (
              <SlideToConfirm label={m.SLIDE_TO_OPEN()} icon={<DoorOpenIcon />} disabled={busy} onConfirm={openDoor} />
            )}
          </div>
        </div>
      </div>
    </Tile>
  );
};

// KeyMatic (BidCos): STATE true is unlocked, OPEN pulls the latch
export const DoorControl = ({ channel }: { channel: KeymaticChannel }) => {
  const setDataPoint = useSetDataPoint();
  const { STATE, STATE_UNCERTAIN } = channel.datapoints;
  const set = (datapoint: 'STATE' | 'OPEN', value: boolean) =>
    setDataPoint(channel.interfaceName, channel.address, datapoint, value);
  return (
    <DoorView
      channel={channel}
      state={STATE_UNCERTAIN === true ? 'unknown' : STATE === true ? 'unlocked' : 'locked'}
      onLock={() => set('STATE', false)}
      onUnlock={() => set('STATE', true)}
      onOpen={() => set('OPEN', true)}
    />
  );
};

// HmIP door lock drive (HmIP-DLD): LOCK_STATE 1 locked, 2 unlocked;
// LOCK_TARGET_LEVEL 0 lock, 1 unlock, 2 open (as in the WebUI's
// door_opener.fn)
export const DoorLockControl = ({ channel }: { channel: Channel }) => {
  const setDataPoint = useSetDataPoint();
  const dp = channel.datapoints as Record<string, DatapointValue>;
  const state: LockState = dp.LOCK_STATE === 1 ? 'locked' : dp.LOCK_STATE === 2 ? 'unlocked' : 'unknown';
  const activity = Number(dp.ACTIVITY_STATE ?? 0);
  const error = [dp.ERROR_JAMMED, dp.ERROR_NO_END_STOP_LOCK, dp.ERROR_NO_END_STOP_UNLOCK].some((e) => e === true);
  const target = (level: number) => setDataPoint(channel.interfaceName, channel.address, 'LOCK_TARGET_LEVEL', level);
  return (
    <DoorView
      channel={channel}
      state={state}
      // ACTIVITY_STATE: 1 UP, 2 DOWN while the drive turns
      busy={activity === 1 || activity === 2}
      error={error}
      onLock={() => target(0)}
      onUnlock={() => target(1)}
      onOpen={() => target(2)}
    />
  );
};
