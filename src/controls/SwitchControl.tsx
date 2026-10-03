import { useEffect, useRef, useState } from 'react';
import { SwitchVirtualReceiverChannel } from '../types/types';
import { useSetDataPoint } from '../queries';
import { Tile } from '../components/Tile';
import { useEffects } from '../contexts/EffectsContext';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';
import PowerIcon from '~icons/lucide/power';
import { litTileStyle, PendantLamp, WARM } from './light/PendantLamp';
import { isLight, useLightTradeIds } from './light/isLight';

interface ControlProps {
  channel: SwitchVirtualReceiverChannel;
}

// Counts how often the state changed, to restart the swing each time, and
// whether the last change came from elsewhere (the wall switch, a program):
// anything but the state this tile just asked for.
export const useStateChanges = <T,>(on: T) => {
  const [changes, setChanges] = useState(0);
  const [external, setExternal] = useState(false);
  const previous = useRef(on);
  const requested = useRef<{ state: T; at: number } | null>(null);
  useEffect(() => {
    if (previous.current === on) return;
    previous.current = on;
    setChanges((c) => c + 1);
    const own = requested.current && requested.current.state === on && Date.now() - requested.current.at < 3000;
    requested.current = null;
    if (!own) {
      setExternal(true);
      const timer = setTimeout(() => setExternal(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [on]);
  return { changes, external, markRequested: (state: T) => (requested.current = { state, at: Date.now() }) };
};

// A switch actuator as a pendant lamp: switched on, it casts a cone of
// warm light into the tile and swings briefly.
export const SwitchControl = ({ channel }: ControlProps) => {
  const setDataPoint = useSetDataPoint();
  const effects = useEffects();
  const { datapoints, name, address, interfaceName } = channel;
  const on = datapoints.STATE === true;
  const { changes, external, markRequested } = useStateChanges(on);
  const state = on ? m.ON() : m.OFF();

  const toggle = () => {
    markRequested(!on);
    setDataPoint(interfaceName, address, 'STATE', !on);
  };

  const lightTrades = useLightTradeIds();
  if (!isLight(channel, lightTrades)) {
    return (
      <Tile
        status={channel.status}
        lit={on}
        className={cn('h-40', on && 'border-emerald-500/40', effects.on && external && 'fx-flash')}
        style={
          on && effects.on
            ? {
                background: `radial-gradient(90% 80% at 50% 0%, rgba(16,185,129,${Math.min(1, 0.16 * effects.k)}), transparent 70%), var(--card)`,
                boxShadow: `0 12px 36px -14px rgba(16,185,129,${Math.min(1, 0.45 * effects.k)})`,
              }
            : undefined
        }
      >
        <button
          onClick={toggle}
          aria-pressed={on}
          aria-label={`${name}: ${state}`}
          data-tile="switch"
          className="press relative flex flex-1 flex-col items-start justify-between overflow-hidden px-3.5 pt-3.5 pb-3 text-left"
        >
          <span className="flex w-full items-center justify-between">
            <span
              className={cn(
                'flex size-9 items-center justify-center rounded-xl transition-colors [&_svg]:size-[18px]',
                on ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-muted text-muted-foreground',
              )}
            >
              <PowerIcon />
            </span>
            {/* A toggle switch, drawn: the knob slides over */}
            <span
              aria-hidden
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors duration-300',
                on ? 'bg-emerald-500' : 'bg-muted-foreground/25',
              )}
              style={on && effects.on ? { boxShadow: `0 0 ${12 * effects.k}px rgba(16,185,129,0.5)` } : undefined}
            >
              <span
                className={cn(
                  'absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] duration-300 ease-[cubic-bezier(.3,.8,.2,1)]',
                  on ? 'left-[22px]' : 'left-0.5',
                )}
              />
            </span>
          </span>
          <span className="relative flex w-full min-w-0 flex-col gap-0.5">
            <span className="line-clamp-2 text-[15px] leading-snug font-medium [overflow-wrap:anywhere]" title={name}>
              {name}
            </span>
            <span className={cn('text-[13px]', on ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}>
              {external ? m.AT_DEVICE({ state }) : state}
            </span>
          </span>
        </button>
      </Tile>
    );
  }

  return (
    <Tile
      status={channel.status}
      lit={on}
      className={cn('h-40', effects.on && external && 'fx-flash')}
      style={litTileStyle(on ? 1 : 0, WARM, effects.on, effects.k)}
    >
      <button
        onClick={toggle}
        aria-pressed={on}
        aria-label={`${name}: ${state}`}
        data-tile="light"
        className="press relative flex flex-1 flex-col items-start justify-end overflow-hidden px-3.5 pb-3 text-left"
      >
        <PendantLamp level={on ? 1 : 0} changes={changes} />
        <span className="relative flex w-full min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 text-[15px] leading-snug font-medium [overflow-wrap:anywhere]" title={name}>
            {name}
          </span>
          <span className={cn('text-[13px]', on ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
            {external ? m.AT_DEVICE({ state }) : state}
          </span>
        </span>
      </button>
    </Tile>
  );
};
