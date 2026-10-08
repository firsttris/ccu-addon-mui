import { useId } from 'react';
import { FloorClimateControlTransceiverChannel } from '../types/types';
import { Tile } from '../components/Tile';
import { useEffects } from '../contexts/EffectsContext';
import { m } from '../paraglide/messages';
import { heatColor } from '../utils/colors';
import { cn } from '../lib/utils';

interface FloorControlProps {
  channel: FloorClimateControlTransceiverChannel;
}

// The water gets warmer the further the valve is open
const water = heatColor;

// The heating loop in the screed, seen from above: four runs that leave and
// return at the manifold on the left
const LOOP = 'M6 14 H104 A8 8 0 0 1 104 30 H18 A8 8 0 0 0 18 46 H104 A8 8 0 0 1 104 62 H6';

// The floor with its heating loop, and the valve opening as a picture: the
// water fills the loop from the manifold as far as the valve is open
// (a quarter of it per run). The further open, the warmer the water and the
// faster it flows; the floor glows and heat rises.
const FloorPicture = ({ value, label }: { value: number; label: string }) => {
  const effects = useEffects();
  const mask = useId();
  const open = value / 100;
  const flowing = value > 0;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className="relative h-[76px] w-[120px] shrink-0 overflow-hidden rounded-[10px] border-[3px] border-zinc-300 bg-[repeating-linear-gradient(135deg,#e4e4e7_0_6px,#dcdce0_6px_12px)] dark:border-zinc-700 dark:bg-[repeating-linear-gradient(135deg,#27272a_0_6px,#232326_6px_12px)]"
    >
      {/* The screed warming up */}
      <div
        className="absolute inset-0 transition-[opacity,background] duration-700"
        style={{
          background: `radial-gradient(90% 90% at 50% 55%, ${water(open, 0.5)}, transparent 75%)`,
          opacity: !flowing ? 0 : effects.on ? Math.min(1, (0.3 + 0.7 * open) * effects.k) : 0.6 * open,
        }}
      />
      <svg aria-hidden viewBox="0 0 114 70" className="absolute inset-0 size-full" fill="none" strokeLinecap="round">
        {/* Where the warm water is: the flow only runs there */}
        <mask id={mask}>
          <path
            d={LOOP}
            pathLength={100}
            strokeWidth="4"
            stroke="white"
            className="transition-[stroke-dasharray] duration-700 ease-[cubic-bezier(.4,0,.2,1)]"
            style={{ strokeDasharray: `${value} 100` }}
          />
        </mask>
        {/* Manifold */}
        <rect x="0" y="8" width="6" height="60" rx="2" className="fill-zinc-400 dark:fill-zinc-600" />
        {/* The cold pipe, the warm water in it, and the water moving */}
        <path d={LOOP} strokeWidth="5" className="stroke-zinc-400/70 dark:stroke-zinc-600" />
        <path
          d={LOOP}
          pathLength={100}
          strokeWidth="3"
          stroke={flowing ? water(open) : 'transparent'}
          className="transition-[stroke,stroke-dasharray] duration-700 ease-[cubic-bezier(.4,0,.2,1)]"
          style={{ strokeDasharray: `${value} 100` }}
        />
        {/* The water moving: bright pulses with a soft halo, faster the further open */}
        {flowing &&
          [
            { width: 3.5, opacity: 0.25 },
            { width: 1.4, opacity: 0.9 },
          ].map(({ width, opacity }) => (
            <path
              key={width}
              d={LOOP}
              strokeWidth={width}
              strokeDasharray="3 13"
              stroke="white"
              strokeOpacity={opacity}
              mask={`url(#${mask})`}
              className={effects.on ? 'fx-flow' : undefined}
              style={{ animationDuration: `${(1.1 - 0.7 * open).toFixed(2)}s` }}
            />
          ))}
      </svg>
      {/* Heat shimmering up off the floor: more of it the further open */}
      {effects.on &&
        flowing &&
        [18, 46, 74].slice(0, Math.ceil(open * 3)).map((left, i) => (
          <svg
            key={left}
            viewBox="0 0 8 24"
            className="fx-heat absolute bottom-0 h-6 w-2"
            style={{ left: `${left}%`, animationDelay: `${i * 0.8}s`, animationDuration: `${(3.2 - 1.2 * open).toFixed(2)}s` }}
          >
            <path
              d="M4 23 C0 19 8 15 4 11 S0 3 4 1"
              fill="none"
              strokeWidth="1.6"
              strokeLinecap="round"
              stroke={water(open, 0.9 * effects.k)}
            />
          </svg>
        ))}
    </div>
  );
};

// Valve opening of one floor heating circuit: laid out like the window and
// door tiles, the picture first, then name and state
export const FloorControl = ({ channel }: FloorControlProps) => {
  const value = Math.round(Number(channel.datapoints.LEVEL) * 100);
  const status = value === 0 ? m.VALVE_CLOSED() : value === 100 ? m.VALVE_OPEN() : m.VALVE_PARTLY({ percent: value });

  return (
    <Tile status={channel.status}>
      <div className="flex items-center gap-3.5 p-3.5">
        <FloorPicture value={value} label={`${m.VALVE_OPENING()} ${channel.name}`} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 text-[15px] leading-snug font-medium" title={channel.name}>
            {channel.name}
          </span>
          <span className={cn('text-[13px] font-medium tabular-nums', value === 0 ? 'text-muted-foreground' : 'text-foreground/80')}>
            {status}
          </span>
        </div>
      </div>
    </Tile>
  );
};
