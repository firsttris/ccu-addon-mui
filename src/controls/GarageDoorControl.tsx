import { useEffect, useRef, useState } from 'react';
import ArrowUpIcon from '~icons/lucide/arrow-up-to-line';
import ArrowDownIcon from '~icons/lucide/arrow-down-to-line';
import WindIcon from '~icons/lucide/wind';
import SquareIcon from '~icons/lucide/square';
import type { Channel } from '../types/types';
import { useSetDataPoint } from '../queries';
import { Tile } from '../components/Tile';
import { HoldButton } from '../components/Gestures';
import { useEffects } from '../contexts/EffectsContext';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';
import { useValueList } from './useValueList';

// As the WebUI's door_opener.fn: DOOR_STATE closed, open, ventilation,
// unknown; DOOR_COMMAND 1 open, 2 stop, 3 close, 4 ventilation
const DOOR_STATE = ['CLOSED', 'OPEN', 'VENTILATION_POSITION', 'POSITION_UNKNOWN'];
const DOOR_COMMAND = ['NOP', 'OPEN', 'STOP', 'CLOSE', 'PARTIAL_OPEN'];

// How far the door is drawn open (share of the opening)
const openShare: Record<string, number> = { CLOSED: 0, OPEN: 1, VENTILATION_POSITION: 0.15, POSITION_UNKNOWN: 0.5 };

const button =
  'press flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border bg-background/60 text-[13px] font-medium hover:bg-accent [&_svg]:size-4';

// Garage door drives (DOOR_RECEIVER, e.g. HmIP-MOD-HO): a garage whose
// sectional door rolls up to the reported position. Opening has to be
// held; closing, ventilation and stop are taps.
export const GarageDoorControl = ({ channel }: { channel: Channel }) => {
  const setDataPoint = useSetDataPoint();
  const effects = useEffects();
  const state = useValueList(channel, 'DOOR_STATE', DOOR_STATE);
  const command = useValueList(channel, 'DOOR_COMMAND', DOOR_COMMAND);
  const name = state.name ?? 'POSITION_UNKNOWN';
  // While a command runs the door is drawn moving towards its target
  const [target, setTarget] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: another door (name) drops the drawn target
  useEffect(() => setTarget(null), [name]);

  const send = (commandName: string, drawTo: number | null) => {
    // Without the device's list the usual numbers, which the WebUI uses too
    const index = command.known ? command.indexOf(commandName) : DOOR_COMMAND.indexOf(commandName);
    if (index < 0) return;
    setDataPoint(channel.interfaceName, channel.address, 'DOOR_COMMAND', index);
    setTarget(drawTo);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTarget(null), 20000);
  };

  const share = target ?? openShare[name] ?? 0.5;
  const status =
    target !== null
      ? target > (openShare[name] ?? 0)
        ? m.GARAGE_OPENING()
        : m.GARAGE_CLOSING()
      : name === 'OPEN'
        ? m.GARAGE_OPEN()
        : name === 'CLOSED'
          ? m.GARAGE_CLOSED()
          : name === 'VENTILATION_POSITION'
            ? m.GARAGE_VENTILATION()
            : m.GARAGE_UNKNOWN();
  const open = name !== 'CLOSED';

  return (
    <Tile status={channel.status} role="group" aria-label={channel.name}>
      <div className="flex gap-4 p-4">
        <div aria-hidden className="relative h-[120px] w-[132px] shrink-0">
          {/* Roof and walls */}
          <div className="absolute inset-x-0 top-0 h-7 bg-zinc-300 [clip-path:polygon(50%_0,100%_100%,0_100%)] dark:bg-zinc-700" />
          <div className="absolute inset-x-1.5 top-7 bottom-0 rounded-b-md bg-zinc-200 dark:bg-zinc-800" />
          {/* The opening: dark inside, a lamp lights up when open */}
          <div className="absolute inset-x-4 top-10 bottom-0 overflow-hidden rounded-t-sm bg-zinc-900">
            <div
              className="absolute inset-0 transition-opacity duration-700"
              style={{
                background: 'radial-gradient(70% 60% at 50% 0%, rgba(253,230,138,0.55), transparent 75%)',
                opacity: effects.on && open ? Math.min(1, effects.k) : 0,
              }}
            />
            {/* Sectional door with its panels */}
            <div
              className="absolute inset-x-0 top-0 bg-[repeating-linear-gradient(180deg,#d4d4d8_0_15px,#a1a1aa_15px_17px)] transition-[height] duration-[1500ms] ease-in-out dark:bg-[repeating-linear-gradient(180deg,#52525b_0_15px,#3f3f46_15px_17px)]"
              style={{ height: `${(1 - share) * 100}%` }}
            >
              <div className="absolute inset-x-0 bottom-0 h-1 bg-zinc-500" />
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="line-clamp-2 text-[15px] leading-snug font-medium" title={channel.name}>
            {channel.name}
          </span>
          <span
            role="status"
            className={cn(
              'text-[13px] font-medium',
              target !== null || name === 'OPEN'
                ? 'text-amber-700 dark:text-amber-300'
                : name === 'CLOSED'
                  ? 'text-green-700 dark:text-green-300'
                  : 'text-muted-foreground',
            )}
          >
            {status}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4">
        {name !== 'OPEN' && (
          <HoldButton
            label={m.GARAGE_OPEN_ACTION()}
            hint={m.HOLD_TO_CONFIRM()}
            icon={<ArrowUpIcon />}
            onConfirm={() => send('OPEN', 1)}
          />
        )}
        <div className="flex gap-2">
          <button type="button" className={button} onClick={() => send('CLOSE', 0)}>
            <ArrowDownIcon />
            {m.GARAGE_CLOSE_ACTION()}
          </button>
          <button type="button" className={button} onClick={() => send('PARTIAL_OPEN', 0.15)}>
            <WindIcon />
            {m.GARAGE_VENTILATE()}
          </button>
          <button
            type="button"
            className={cn(button, 'max-w-12')}
            aria-label={m.BLIND_STOP()}
            title={m.BLIND_STOP()}
            onClick={() => send('STOP', null)}
          >
            <SquareIcon className="fill-current !size-3.5" />
          </button>
        </div>
      </div>
    </Tile>
  );
};
