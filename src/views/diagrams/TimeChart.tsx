import { type CSSProperties, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useEffects } from '../../contexts/EffectsContext';
import {
  ChartAxes,
  ChartBars,
  ChartLines,
  ChartTooltip,
  type Delay,
  LivePulse,
  PointerMarks,
  StateLanes,
} from './TimeChartParts';
import { type RenderSeries, timeTicks } from './chart';
import {
  geometryOf,
  type LinePaths,
  linePaths,
  scaleKey,
  scalesOf,
  TOP,
  tooltipRows,
  typicalStep,
} from './chartGeometry';

interface TimeChartProps {
  label: string;
  series: RenderSeries[];
  from: number;
  to: number;
  height?: number;
  // Changes when the chart should draw in again (another range or other
  // series), not with every new value
  animationKey?: string;
  live?: boolean;
  onZoom: (from: number, to: number) => void;
}

// A time chart of several series, each drawn its own way: lines with the
// range between minimum and maximum as a band, areas, bars per calendar
// interval, steps, and states as bands below the chart. A value axis per
// side, gaps where values are missing, the period before for comparison.
// Hovering shows the values, dragging zooms in.
// A time chart of several series, each drawn its own way: lines with the
// range between minimum and maximum as a band, areas, bars per calendar
// interval, steps, and states as bands below the chart. A value axis per
// side, gaps where values are missing, the period before for comparison.
// Hovering shows the values, dragging zooms in.
export const TimeChart = ({
  label,
  series,
  from,
  to,
  height = 300,
  animationKey = '',
  live = false,
  onZoom,
}: TimeChartProps) => {
  const effects = useEffects();
  const strong = effects.level === 'strong';
  // Strong effects draw the series one after the other
  const delay: Delay = (i) => ({ '--chart-delay': `${strong ? i * 180 : 0}ms` }) as CSSProperties;
  const ref = useRef<HTMLDivElement>(null);
  const id = `chart${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const states = series.filter((s) => s.kind === 'state');
  const drawn = useMemo(() => series.filter((s) => s.kind !== 'state'), [series]);
  const bars = drawn.filter((s) => s.kind === 'bar');
  const scales = useMemo(() => scalesOf(drawn), [drawn]);
  const g = geometryOf({ width, height, from, to, scales, states: states.length });
  const { left, plotWidth, plotHeight, total, lanes } = g;

  // The paths and the typical spacing of the points change with the data
  // and the size, not while the pointer moves over the chart
  // biome-ignore lint/correctness/useExhaustiveDependencies: g changes with exactly these
  const lineSeries = useMemo(() => {
    const result = new Map<string, { paths: LinePaths; before: LinePaths | null }>();
    for (const s of drawn) {
      const scale = scales.get(scaleKey(s));
      if (s.kind === 'bar' || !scale) continue;
      result.set(s.key, {
        paths: linePaths(g, s, s.points, scale),
        before: s.compare ? linePaths(g, s, s.compare.points, scale) : null,
      });
    }
    return result;
  }, [drawn, scales, width, height, from, to]);
  const steps = useMemo(() => new Map(series.map((s) => [s.key, typicalStep(s.points)])), [series]);

  const span = to - from;
  const xTicks = timeTicks(from, to, Math.max(3, Math.floor(plotWidth / 90)));

  const pointerX = (event: React.PointerEvent) => {
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
    return Math.min(left + plotWidth, Math.max(left, ((event.clientX - rect.left) / rect.width) * width));
  };

  const hoverTime = hover !== null ? g.timeAt(hover) : null;
  const tooltip = hoverTime === null ? [] : tooltipRows(series, hoverTime, span, steps);

  return (
    <div ref={ref} className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${width} ${total}`}
        width="100%"
        height={total}
        role="img"
        aria-label={label}
        className="touch-pan-y overflow-visible"
        onPointerMove={(event) => {
          const px = pointerX(event);
          setHover(px);
          if (drag) setDrag({ ...drag, end: px });
        }}
        onPointerLeave={() => {
          setHover(null);
          setDrag(null);
        }}
        onPointerDown={(event) => {
          const px = pointerX(event);
          (event.currentTarget as SVGElement).setPointerCapture?.(event.pointerId);
          setDrag({ start: px, end: px });
        }}
        onPointerUp={() => {
          if (drag && Math.abs(drag.end - drag.start) > 8) {
            const a = g.timeAt(Math.min(drag.start, drag.end));
            const b = g.timeAt(Math.max(drag.start, drag.end));
            if (b - a >= 10 * 60 * 1000) onZoom(a, b);
          }
          setDrag(null);
        }}
      >
        <defs>
          <clipPath id={`${id}-clip`}>
            <rect x={left} y={TOP - 2} width={Math.max(0, plotWidth)} height={plotHeight + 4} />
          </clipPath>
          {drawn.map((s, i) => (
            <linearGradient key={s.key} id={`${id}-g${i}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <ChartAxes g={g} xTicks={xTicks} span={span} />
        <g key={animationKey} className={effects.on ? 'chart-anim' : undefined} data-level={effects.level}>
          <g clipPath={`url(#${id}-clip)`}>
            <ChartBars g={g} bars={bars} strong={strong} />
            <ChartLines drawn={drawn} lineSeries={lineSeries} id={id} delay={delay} />
          </g>
          <StateLanes g={g} states={states} delay={delay} />
          <LivePulse g={g} drawn={drawn} strong={strong} live={live} />
        </g>
        <PointerMarks g={g} hover={hover} drag={drag} tooltip={tooltip} />
        <rect
          x={left}
          y={TOP}
          width={Math.max(0, plotWidth)}
          height={plotHeight + lanes}
          fill="transparent"
          className="cursor-crosshair"
        />
      </svg>
      <ChartTooltip hover={hover} hoverTime={hoverTime} drag={drag} tooltip={tooltip} width={width} />
    </div>
  );
};
