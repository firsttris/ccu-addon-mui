import { useId } from 'react';
import { FloorClimateControlTransceiverChannel } from '../types/types';
import { Tile } from '../components/Tile';
import { useEffects } from '../contexts/EffectsContext';
import { m } from '../paraglide/messages';

interface FloorControlProps {
  channel: FloorClimateControlTransceiverChannel;
}

// The water gets warmer the further the valve is open: amber to red-orange
const water = (open: number, alpha = 1, lightness = 55) =>
  `hsl(${40 - 28 * open} 95% ${lightness}% / ${Math.max(0, Math.min(1, alpha))})`;

// The heating loop in the screed, seen from above: four runs that leave and
// return at the manifold on the left
const LOOP = 'M6 14 H104 A8 8 0 0 1 104 30 H18 A8 8 0 0 0 18 46 H104 A8 8 0 0 1 104 62 H6';

// The floor with its heating loop, and the valve opening as a picture: the
// warm water fills the loop from the manifold as far as the valve is open
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
        {flowing && (
          <path
            d={LOOP}
            strokeWidth="1.5"
            strokeDasharray="4 12"
            stroke="white"
            strokeOpacity="0.8"
            mask={`url(#${mask})`}
            className={effects.on ? 'fx-flow' : undefined}
            // Faster flow the further the valve is open
            style={{ animationDuration: `${(2.4 - 1.8 * open).toFixed(2)}s` }}
          />
        )}
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

// Valve opening of one floor heating circuit
export const FloorControl = ({ channel }: FloorControlProps) => {
  const effects = useEffects();
  const value = Math.round(Number(channel.datapoints.LEVEL) * 100);
  const open = value / 100;
  const glowing = effects.on && value > 0;

  return (
    <Tile status={channel.status}>
      <div className="flex flex-col gap-3 p-4">
        <span className="line-clamp-2 text-[15px] leading-snug font-medium" title={channel.name}>
          {channel.name}
        </span>
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span
              className="text-[40px] leading-none font-semibold tracking-[-0.04em] tabular-nums"
              style={glowing ? { textShadow: `0 0 ${18 * effects.k}px ${water(open, 0.45)}` } : undefined}
            >
              {value}
              <span className="ml-0.5 align-top text-lg font-medium tracking-normal text-muted-foreground">%</span>
            </span>
            <span className="mt-1.5 text-[13px] text-muted-foreground">{m.VALVE_OPENING()}</span>
          </div>
          <FloorPicture value={value} label={`${m.VALVE_OPENING()} ${channel.name}`} />
        </div>
      </div>
    </Tile>
  );
};
