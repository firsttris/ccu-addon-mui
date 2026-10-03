import { FloorClimateControlTransceiverChannel } from '../types/types';
import { Tile } from '../components/Tile';
import { useEffects, rgba } from '../contexts/EffectsContext';
import { getPercentageColor, getPercentageGradient } from '../utils/colors';
import { m } from '../paraglide/messages';

interface FloorControlProps {
  channel: FloorClimateControlTransceiverChannel;
}

// Valve opening of one floor heating circuit
export const FloorControl = ({ channel }: FloorControlProps) => {
  const effects = useEffects();
  const value = Math.round(Number(channel.datapoints.LEVEL) * 100);
  const color = getPercentageColor(value);
  const glowing = effects.on && value > 0;

  return (
    <Tile status={channel.status}>
      <div className="flex flex-col gap-2.5 px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[15px] font-medium" title={channel.name}>
            {channel.name}
          </span>
          <span
            className="shrink-0 font-semibold tabular-nums transition-colors duration-500"
            style={{
              color: value === 0 ? undefined : color,
              textShadow: glowing ? `0 0 ${12 * effects.k}px ${rgba(color, 0.4 * effects.k)}` : undefined,
            }}
          >
            {value} %
          </span>
        </div>
        <div
          role="meter"
          aria-label={`${m.VALVE_OPENING()} ${channel.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          className="h-2.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="relative h-full overflow-hidden rounded-full transition-[width,background] duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{
              width: `${value}%`,
              background: getPercentageGradient(value),
              boxShadow: glowing ? `0 0 ${10 * effects.k}px ${rgba(color, 0.5 * effects.k)}` : undefined,
            }}
          >
            {glowing && (
              <div
                className="fx-shimmer absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)]"
                style={{ opacity: Math.min(1, 0.6 * effects.k) }}
              />
            )}
          </div>
        </div>
      </div>
    </Tile>
  );
};
