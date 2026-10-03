import { useEffect, useId, useRef, useState } from 'react';
import { SwitchVirtualReceiverChannel } from '../types/types';
import { useSetDataPoint } from '../queries';
import { Tile } from '../components/Tile';
import { useEffects } from '../contexts/EffectsContext';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';

interface ControlProps {
  channel: SwitchVirtualReceiverChannel;
}

// Counts how often the state changed, to restart the swing each time, and
// whether the last change came from elsewhere (the wall switch, a program):
// anything but the state this tile just asked for.
const useStateChanges = (on: boolean) => {
  const [changes, setChanges] = useState(0);
  const [external, setExternal] = useState(false);
  const previous = useRef(on);
  const requested = useRef<{ state: boolean; at: number } | null>(null);
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
  return { changes, external, markRequested: (state: boolean) => (requested.current = { state, at: Date.now() }) };
};

// A switch actuator as a pendant lamp: switched on, it casts a cone of
// warm light into the tile and swings briefly.
export const SwitchControl = ({ channel }: ControlProps) => {
  const setDataPoint = useSetDataPoint();
  const effects = useEffects();
  const id = useId();
  const { datapoints, name, address, interfaceName } = channel;
  const on = datapoints.STATE === true;
  const { changes, external, markRequested } = useStateChanges(on);
  const k = effects.k;
  const a = (alpha: number) => Math.min(1, alpha * k);
  const state = on ? m.ON() : m.OFF();

  const toggle = () => {
    markRequested(!on);
    setDataPoint(interfaceName, address, 'STATE', !on);
  };

  return (
    <Tile
      status={channel.status}
      lit={on}
      className={cn('h-40', effects.on && external && 'fx-flash')}
      style={
        on
          ? {
              borderColor: 'rgba(251,191,36,0.42)',
              background: effects.on
                ? `radial-gradient(85% 75% at 50% 18%, rgba(251,191,36,${a(0.2)}), transparent 72%), radial-gradient(70% 38% at 50% 100%, rgba(251,191,36,${a(0.14)}), transparent 75%), var(--card)`
                : 'color-mix(in oklab, rgb(251 191 36) 14%, var(--card))',
              boxShadow: effects.on ? `0 12px 40px -12px rgba(251,191,36,${a(0.5)})` : undefined,
            }
          : undefined
      }
    >
      <button
        onClick={toggle}
        aria-pressed={on}
        aria-label={`${name}: ${state}`}
        className="press relative flex flex-1 flex-col items-start justify-end overflow-hidden px-3.5 pb-3 text-left"
      >
        <svg
          aria-hidden
          viewBox="0 0 160 120"
          preserveAspectRatio="xMidYMin meet"
          className="pointer-events-none absolute inset-x-0 top-0 h-[120px] w-full overflow-visible"
        >
          <defs>
            <linearGradient id={`${id}-cone`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fde68a" stopOpacity="0.55" />
              <stop offset="0.5" stopColor="#fbbf24" stopOpacity="0.16" />
              <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
            </linearGradient>
            <filter id={`${id}-bulb`} x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>
          <g
            key={effects.on ? changes : 0}
            className={cn(
              '[transform-box:fill-box] [transform-origin:50%_0]',
              effects.on && changes > 0 && (changes % 2 ? 'fx-swing-a' : 'fx-swing-b'),
            )}
          >
            <line x1="80" y1="-2" x2="80" y2="22" className="stroke-muted-foreground/50" strokeWidth="1.5" />
            {effects.on && (
              <polygon
                points="60,40 100,40 150,150 10,150"
                fill={`url(#${id}-cone)`}
                opacity={on ? Math.min(1, Math.min(1.25, k)) : 0}
                className={cn('transition-opacity duration-500', on && changes > 0 && 'fx-flicker')}
              />
            )}
            {effects.on && (
              <circle
                cx="80"
                cy="41"
                r="10"
                fill="#fde68a"
                filter={`url(#${id}-bulb)`}
                opacity={on ? a(1) : 0}
                className="transition-opacity duration-400"
              />
            )}
            <path
              d="M58 40 Q58 22 80 22 Q102 22 102 40 Z"
              className={cn('transition-[fill] duration-400', on ? 'fill-zinc-500' : 'fill-muted-foreground/30')}
              stroke={on ? 'rgba(253,230,138,0.6)' : 'transparent'}
              strokeWidth="1"
            />
            <circle
              cx="80"
              cy="41"
              r="5"
              className={cn('transition-[fill] duration-300', on ? 'fill-amber-100' : 'fill-muted-foreground/40')}
            />
          </g>
        </svg>
        <span className="relative flex w-full min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 text-[15px] leading-snug font-medium" title={name}>
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
