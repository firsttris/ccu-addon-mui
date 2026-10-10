import { numberFormat } from '../../lib/format';
import { cn } from '../../lib/utils';
import { m } from '../../paraglide/messages';
import type { EnergyPrice } from '../../types/protocol';
import { type RenderSeries, seriesStats } from './chart';
import { costOf } from './diagramModel';
import { formatSeriesValue, formatValue } from './TimeChartParts';

const costFormat = (currency: string) => numberFormat({ style: 'currency', currency });

// What a series shows below its value: average and range, for a
// consumption also that it is the sum
const statsLine = (s: RenderSeries, stats: NonNullable<ReturnType<typeof seriesStats>>) => {
  const avgAndRange = `${m.DIAG_STAT_AVG({ value: formatValue(stats.avg, s.unit) })} · ${m.DIAG_STAT_RANGE({ min: formatValue(stats.min, s.unit), max: formatValue(stats.max, s.unit) })}`;
  return stats.sum !== undefined ? `${m.DIAG_STAT_SUM({ value: '' }).trim()} · ${avgAndRange}` : avgAndRange;
};

const LegendItem = ({
  series: s,
  hidden,
  energyPrice,
  onToggle,
}: {
  series: RenderSeries;
  hidden: boolean;
  energyPrice?: EnergyPrice;
  onToggle: () => void;
}) => {
  const stats = seriesStats(s);
  const cost = stats?.sum !== undefined ? costOf(stats.sum, s.unit, energyPrice) : null;
  return (
    <li>
      <button
        type="button"
        aria-pressed={!hidden}
        aria-label={m.DIAG_TOGGLE({ name: s.label })}
        onClick={onToggle}
        className={cn(
          'flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent',
          hidden && 'opacity-40',
        )}
      >
        <span className="mt-1 h-3 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="flex items-baseline gap-2">
            <span className="truncate">{s.label}</span>
            {stats && (
              <span className="shrink-0 text-base font-semibold tabular-nums">
                {stats.sum !== undefined ? formatValue(stats.sum, s.unit) : formatSeriesValue(s, stats.current)}
              </span>
            )}
          </span>
          {cost !== null && energyPrice && (
            <span className="text-xs font-medium text-emerald-700 tabular-nums dark:text-emerald-400">
              {m.DIAG_COST({ value: costFormat(energyPrice.currency).format(cost) })}
            </span>
          )}
          {stats && s.kind !== 'state' && !(s.kind === 'step' && stats.min === 0 && stats.max === 1) && (
            <span className="text-xs text-muted-foreground tabular-nums">{statsLine(s, stats)}</span>
          )}
        </span>
      </button>
    </li>
  );
};

// The series with their current value or sum, costs and statistics; a tap
// hides or shows one in the chart
export const DiagramLegend = ({
  series,
  hidden,
  narrow,
  energyPrice,
  onToggle,
}: {
  series: RenderSeries[];
  hidden: Set<string>;
  // One column, for a tile
  narrow: boolean;
  energyPrice?: EnergyPrice;
  onToggle: (key: string) => void;
}) => (
  <ul
    className={cn('grid gap-x-4 gap-y-1.5', narrow ? 'grid-cols-1' : 'sm:grid-cols-2 xl:grid-cols-3')}
    aria-label={m.DIAG_SERIES()}
  >
    {series.map((s) => (
      <LegendItem
        key={s.key}
        series={s}
        hidden={hidden.has(s.key)}
        energyPrice={energyPrice}
        onToggle={() => onToggle(s.key)}
      />
    ))}
  </ul>
);
