import { useEffect, useRef, useState } from 'react';
import AppWindowIcon from '~icons/lucide/app-window';
import { useEffects } from '../../contexts/EffectsContext';
import { getLocale } from '../../paraglide/runtime';
import { m } from '../../paraglide/messages';
import { cn } from '../../lib/utils';

interface TemperatureDisplayProps {
  localTarget: number;
  currentTemperature: number;
  humidity?: number;
  windowOpen: boolean;
  color: string;
}

const formatTemperature = (value: number) =>
  new Intl.NumberFormat(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);

// Counts changes of a value, to restart an animation on each one
const useChangeCount = (value: number) => {
  const [count, setCount] = useState(0);
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current !== value) {
      previous.current = value;
      setCount((c) => c + 1);
    }
  }, [value]);
  return count;
};

export const TemperatureDisplay: React.FC<TemperatureDisplayProps> = ({
  localTarget,
  currentTemperature,
  humidity,
  windowOpen,
  color,
}) => {
  const effects = useEffects();
  const changes = useChangeCount(localTarget);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[17%] flex flex-col items-center">
      <AppWindowIcon
        role="img"
        aria-label={windowOpen ? m.WINDOW_OPEN() : undefined}
        aria-hidden={!windowOpen}
        className={cn(
          'size-5',
          windowOpen ? 'text-blue-500 dark:text-blue-400' : 'text-muted-foreground opacity-30',
          windowOpen && effects.on && 'fx-pulse',
        )}
      />
      <div
        key={effects.on ? changes % 2 : 0}
        className={cn(
          'mt-0.5 text-[46px] leading-none font-semibold tracking-[-0.04em] tabular-nums',
          effects.on && changes > 0 && (changes % 2 ? 'fx-rise-a' : 'fx-rise-b'),
        )}
        style={effects.on ? { textShadow: `0 0 ${18 * effects.k}px ${color}59` } : undefined}
      >
        {formatTemperature(localTarget)}
        <span className="ml-0.5 align-top text-lg font-medium text-muted-foreground">°C</span>
      </div>
      <div className="my-1.5 h-px w-8 bg-border" />
      <div className="flex gap-4">
        <div className="flex flex-col items-center">
          <span className="text-sm font-medium tabular-nums">{formatTemperature(currentTemperature)}°</span>
          <span className="text-[10px] tracking-[0.06em] text-muted-foreground uppercase">{m.ACTUAL()}</span>
        </div>
        {humidity !== undefined && humidity > 0 && (
          <div className="flex flex-col items-center">
            <span className="text-sm font-medium tabular-nums">{humidity} %</span>
            <span className="text-[10px] tracking-[0.06em] text-muted-foreground uppercase">{m.HUMIDITY()}</span>
          </div>
        )}
      </div>
    </div>
  );
};
