import ChevronLeftIcon from '~icons/lucide/chevron-left';
import ChevronRightIcon from '~icons/lucide/chevron-right';
import HistoryIcon from '~icons/lucide/history';
import ZoomOutIcon from '~icons/lucide/zoom-out';
import { Button } from '../../components/ui/button';
import { formatDate } from '../../lib/format';
import { cn } from '../../lib/utils';
import { m } from '../../paraglide/messages';
import { type Period, periods } from './chart';
import type { Range } from './diagramModel';

const periodLabels: Record<Period, () => string> = {
  day: m.DIAG_PERIOD_DAY,
  week: m.DIAG_PERIOD_WEEK,
  month: m.DIAG_PERIOD_MONTH,
  year: m.DIAG_PERIOD_YEAR,
};

const rangeStyle: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

// The period, earlier and later, back from a zoom, the comparison with the
// span before, and the span shown
export const DiagramToolbar = ({
  range,
  from,
  to,
  live,
  compare,
  onRange,
  onShift,
  onCompare,
}: {
  range: Range;
  from: number;
  to: number;
  live: boolean;
  compare: boolean;
  onRange: (range: Range) => void;
  onShift: (direction: -1 | 1) => void;
  onCompare: () => void;
}) => (
  <div className="flex flex-wrap items-center gap-2">
    {/* biome-ignore lint/a11y/useSemanticElements: a fieldset brings its own border and spacing */}
    <div role="group" aria-label={m.DIAG_PERIOD()} className="inline-flex rounded-lg bg-muted p-0.5">
      {(Object.keys(periods) as Period[]).map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={!('zoomed' in range) && range.period === p}
          onClick={() => onRange({ period: p, end: null })}
          className={cn(
            'h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors',
            !('zoomed' in range) && range.period === p && 'bg-background text-foreground shadow-xs',
          )}
        >
          {periodLabels[p]()}
        </button>
      ))}
    </div>
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-7"
      aria-label={m.DIAG_EARLIER()}
      onClick={() => onShift(-1)}
    >
      <ChevronLeftIcon />
    </Button>
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-7"
      aria-label={m.DIAG_LATER()}
      disabled={live}
      onClick={() => onShift(1)}
    >
      <ChevronRightIcon />
    </Button>
    {'zoomed' in range && (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7"
        onClick={() => onRange({ period: range.period, end: null })}
      >
        <ZoomOutIcon />
        {m.DIAG_ZOOM_RESET()}
      </Button>
    )}
    <Button
      type="button"
      variant={compare ? 'secondary' : 'ghost'}
      size="sm"
      className="h-7"
      aria-pressed={compare}
      onClick={onCompare}
    >
      <HistoryIcon />
      {m.DIAG_COMPARE()}
    </Button>
    <span className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums" aria-live="polite">
      {live && (
        <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          {m.DIAG_LIVE()}
        </span>
      )}
      {formatDate(from, rangeStyle)} – {formatDate(to, rangeStyle)}
    </span>
  </div>
);
