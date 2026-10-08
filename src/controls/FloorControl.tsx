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

// The floor with its heating loop: the further the valve is open, the
// warmer the water and the faster it flows, the floor glows and heat rises
const FloorPicture = ({ value }: { value: number }) => {
  const effects = useEffects();
  const open = value / 100;
  const flowing = value > 0;
  return (
    <div
      aria-hidden
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
      <svg viewBox="0 0 114 70" className="absolute inset-0 size-full" fill="none" strokeLinecap="round">
        {/* Manifold */}
        <rect x="0" y="8" width="6" height="60" rx="2" className="fill-zinc-400 dark:fill-zinc-600" />
        {/* The pipe, the water in it, and the water moving */}
        <path d={LOOP} strokeWidth="5" className="stroke-zinc-400/70 dark:stroke-zinc-600" />
        <path
          d={LOOP}
          strokeWidth="3"
          className="transition-[stroke] duration-700"
          stroke={flowing ? water(open) : 'transparent'}
        />
        {flowing && (
          <path
            d={LOOP}
            strokeWidth="1.5"
            strokeDasharray="4 12"
            stroke="white"
            strokeOpacity="0.8"
            className={effects.on ? 'fx-flow' : undefined}
            // Faster flow the further the valve is open
            style={{ animationDuration: `${(2.4 - 1.8 * open).toFixed(2)}s` }}
          />
        )}
      </svg>
      {/* Heat shimmering up off the floor */}
      {effects.on &&
        flowing &&
        [18, 46, 74].map((left, i) => (
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
      <div className="flex items-center gap-3.5 p-3.5">
        <FloorPicture value={value} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="line-clamp-2 text-[15px] leading-snug font-medium" title={channel.name}>
            {channel.name}
          </span>
          <span
            className="text-lg font-semibold tabular-nums transition-colors duration-500"
            style={{
              color: value === 0 ? undefined : water(open, 1, 46),
              textShadow: glowing ? `0 0 ${12 * effects.k}px ${water(open, 0.4 * effects.k)}` : undefined,
            }}
          >
            {value} %
          </span>
          <div
            role="meter"
            aria-label={`${m.VALVE_OPENING()} ${channel.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full transition-[width,background] duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={{
                width: `${value}%`,
                background: `linear-gradient(90deg, ${water(0)}, ${water(open)})`,
                boxShadow: glowing ? `0 0 ${8 * effects.k}px ${water(open, 0.5 * effects.k)}` : undefined,
              }}
            />
          </div>
        </div>
      </div>
    </Tile>
  );
};
