import { useEffects } from '../../contexts/EffectsContext';
import { heatColor } from '../../utils/colors';
import { m } from '../../paraglide/messages';

// The radiator behind a radiator thermostat, warmed from below as far as its
// valve is open (VALVE_STATE, HmIP LEVEL), in the colors of the floor
// heating, with heat rising off it while the valve is open
export const Radiator = ({ valve }: { valve: number }) => {
  const effects = useEffects();
  const open = Math.min(1, Math.max(0, valve / 100));
  const warm = valve > 0;
  return (
    <div className="flex items-center justify-center gap-3">
      <div aria-hidden className="relative h-12 w-[76px] overflow-hidden pt-4">
        {/* Heat rising: more of it the further open */}
        {effects.on &&
          warm &&
          [14, 44, 74].slice(0, Math.ceil(open * 3)).map((left, i) => (
            <svg
              key={left}
              viewBox="0 0 8 24"
              className="fx-heat absolute bottom-6 h-5 w-2"
              style={{ left: `${left}%`, animationDelay: `${i * 0.8}s`, animationDuration: `${(3.2 - 1.2 * open).toFixed(2)}s` }}
            >
              <path
                d="M4 23 C0 19 8 15 4 11 S0 3 4 1"
                fill="none"
                strokeWidth="1.6"
                strokeLinecap="round"
                stroke={heatColor(open, 0.9 * effects.k)}
              />
            </svg>
          ))}
        {/* Seven ribs, filled from below */}
        <div className="flex h-full gap-[3px] rounded-[4px] border-y-[3px] border-zinc-300 dark:border-zinc-600">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="relative flex-1 overflow-hidden rounded-[3px] bg-zinc-300/70 dark:bg-zinc-700">
              <div
                className="absolute inset-x-0 bottom-0 transition-[height,background] duration-700 ease-[cubic-bezier(.4,0,.2,1)]"
                style={{
                  height: `${valve}%`,
                  background: `linear-gradient(0deg, ${heatColor(open)}, ${heatColor(open, 0.55)})`,
                  boxShadow: warm && effects.on ? `0 0 ${8 * effects.k}px ${heatColor(open, 0.5)}` : undefined,
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <span className="text-[13px] font-medium tabular-nums text-muted-foreground">{m.VALVE({ percent: valve })}</span>
    </div>
  );
};
