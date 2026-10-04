import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { defaultLang } from '../../i18n/utils';
import { isBinary, nearest, niceTicks, timeTicks, valueRange, DAY, type ChartPoint, type ChartSeries } from './chart';

const HEIGHT = 280;
const TOP = 10;
const BOTTOM = 26;
const AXIS = 46;

const numberFormat = new Intl.NumberFormat(defaultLang, { maximumFractionDigits: 2 });
const tickNumber = new Intl.NumberFormat(defaultLang, { maximumFractionDigits: 1 });
const hourFormat = new Intl.DateTimeFormat(defaultLang, { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(defaultLang, { day: '2-digit', month: '2-digit' });
const monthFormat = new Intl.DateTimeFormat(defaultLang, { month: 'short', year: '2-digit' });
const tooltipFormat = new Intl.DateTimeFormat(defaultLang, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const formatValue = (v: number, unit: string) => `${numberFormat.format(v)}${unit ? ` ${unit}` : ''}`;

interface Scale {
  unit: string;
  lo: number;
  hi: number;
  binary: boolean;
}

// The typical distance of a series' points; a much longer one is a gap
const typicalStep = (points: ChartPoint[]) => {
  if (points.length < 3) return Infinity;
  const deltas = points.slice(1).map((p, i) => p[0] - points[i][0]).sort((a, b) => a - b);
  return deltas[deltas.length >> 1];
};

interface TimeChartProps {
  label: string;
  series: ChartSeries[];
  from: number;
  to: number;
  onZoom: (from: number, to: number) => void;
}

// A time chart of several series: lines of the averages with the range
// between minimum and maximum as a band, steps for switches, a value axis
// per unit (the first two shown, left and right), gaps where values are
// missing. Hovering shows the values, dragging zooms in.
export const TimeChart = ({ label, series, from, to, onZoom }: TimeChartProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const clipId = `chart-clip${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
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

  // A scale per unit; switches get their own from 0 to 1
  const scales = useMemo(() => {
    const byUnit = new Map<string, ChartSeries[]>();
    for (const s of series) {
      const key = isBinary(s.points) ? `bin:${s.key}` : s.unit;
      byUnit.set(key, [...(byUnit.get(key) ?? []), s]);
    }
    const result = new Map<string, Scale>();
    for (const [key, list] of byUnit) {
      const binary = key.startsWith('bin:');
      const range = binary ? ([0, 1] as [number, number]) : valueRange(list);
      if (range) result.set(key, { unit: list[0].unit, lo: range[0], hi: range[1], binary });
    }
    return result;
  }, [series]);
  const scaleOf = (s: ChartSeries) => scales.get(isBinary(s.points) ? `bin:${s.key}` : s.unit);
  const axes = [...scales.values()].filter((s) => !s.binary || scales.size === 1).slice(0, 2);
  const left = AXIS;
  const right = axes.length > 1 ? AXIS : 14;
  const plotWidth = width - left - right;
  const plotHeight = HEIGHT - TOP - BOTTOM;

  const x = (t: number) => left + ((t - from) / (to - from)) * plotWidth;
  const timeAt = (px: number) => from + ((px - left) / plotWidth) * (to - from);
  const y = (scale: Scale, v: number) => {
    // Switches use the middle of the height, so their steps don't hide
    // under the axis
    if (scale.binary && scales.size > 1) return TOP + plotHeight * 0.75 - v * plotHeight * 0.5;
    return TOP + plotHeight - ((v - scale.lo) / (scale.hi - scale.lo || 1)) * plotHeight;
  };

  const paths = series.map((s) => {
    const scale = scaleOf(s);
    if (!scale || s.points.length === 0) return { key: s.key, line: '', band: '', dots: [] as [number, number][] };
    const gap = s.points.length > 2 && !scale.binary ? Math.max(typicalStep(s.points) * 8, 30 * 60 * 1000) : Infinity;
    let line = '';
    let band = '';
    let segment: ChartPoint[] = [];
    // Values without a neighbour get a dot, a line would not show them
    const dots: [number, number][] = [];
    const flush = () => {
      if (segment.length === 0) return;
      if (segment.length === 1 && !scale.binary) dots.push([x(segment[0][0]), y(scale, segment[0][1])]);
      if (segment.some((p) => p[3] > p[2])) {
        const top = segment.map((p) => `${x(p[0]).toFixed(1)},${y(scale, p[3]).toFixed(1)}`);
        const bottom = segment.map((p) => `${x(p[0]).toFixed(1)},${y(scale, p[2]).toFixed(1)}`).reverse();
        band += `M${top.join('L')}L${bottom.join('L')}Z`;
      }
      segment = [];
    };
    s.points.forEach((p, i) => {
      const prev = s.points[i - 1];
      const px = x(p[0]).toFixed(1);
      const py = y(scale, scale.binary ? Math.round(p[1]) : p[1]).toFixed(1);
      if (!prev || p[0] - prev[0] > gap) {
        flush();
        line += `M${px},${py}`;
      } else if (scale.binary) {
        line += `H${px}V${py}`;
      } else {
        line += `L${px},${py}`;
      }
      segment.push(p);
    });
    flush();
    // The last value of a switch lasts until now
    if (scale.binary) line += `H${Math.min(x(Date.now()), left + plotWidth).toFixed(1)}`;
    return { key: s.key, line, band, dots };
  });

  const span = to - from;
  const xTicks = timeTicks(from, to, Math.max(2, Math.floor(plotWidth / 90)));
  const formatTick = (t: number) => {
    if (span <= 2 * DAY) return hourFormat.format(t);
    if (span <= 120 * DAY) return dayFormat.format(t);
    return monthFormat.format(t);
  };

  const pointerX = (event: React.PointerEvent) => {
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
    return Math.min(left + plotWidth, Math.max(left, ((event.clientX - rect.left) / rect.width) * width));
  };

  const hoverTime = hover !== null ? timeAt(hover) : null;
  const tooltip =
    hoverTime !== null
      ? series
          .map((s) => ({ s, p: nearest(s.points, hoverTime) }))
          .filter((e): e is { s: ChartSeries; p: ChartPoint } => !!e.p && Math.abs(e.p[0] - hoverTime) <= Math.max(span / 40, typicalStep(e.s.points) * 1.5))
      : [];

  return (
    <div ref={ref} className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
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
            const a = timeAt(Math.min(drag.start, drag.end));
            const b = timeAt(Math.max(drag.start, drag.end));
            if (b - a >= 10 * 60 * 1000) onZoom(a, b);
          }
          setDrag(null);
        }}
      >
        {/* Grid and axes */}
        {axes[0] &&
          niceTicks(axes[0].lo, axes[0].hi).map((v) => (
            <g key={`l${v}`}>
              <line x1={left} x2={left + plotWidth} y1={y(axes[0], v)} y2={y(axes[0], v)} className="stroke-border" strokeDasharray="2 3" />
              <text x={left - 6} y={y(axes[0], v)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                {tickNumber.format(v)}
              </text>
            </g>
          ))}
        {axes[1] &&
          niceTicks(axes[1].lo, axes[1].hi).map((v) => (
            <text key={`r${v}`} x={left + plotWidth + 6} y={y(axes[1], v)} dy="0.32em" className="fill-muted-foreground text-[11px] tabular-nums">
              {tickNumber.format(v)}
            </text>
          ))}
        {axes.map((axis, i) =>
          axis.unit ? (
            <text key={`u${i}`} x={i === 0 ? left - 6 : left + plotWidth + 6} y={TOP - 2} textAnchor={i === 0 ? 'end' : 'start'} className="fill-muted-foreground text-[10px]">
              {axis.unit}
            </text>
          ) : null,
        )}
        {xTicks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={TOP} y2={TOP + plotHeight} className="stroke-border/60" />
            <text x={x(t)} y={HEIGHT - 8} textAnchor="middle" className="fill-muted-foreground text-[11px] tabular-nums">
              {formatTick(t)}
            </text>
          </g>
        ))}
        <line x1={left} x2={left + plotWidth} y1={TOP + plotHeight} y2={TOP + plotHeight} className="stroke-border" />

        {/* Series */}
        <clipPath id={clipId}>
          <rect x={left} y={TOP - 2} width={Math.max(0, plotWidth)} height={plotHeight + 4} />
        </clipPath>
        <g clipPath={`url(#${clipId})`}>
          {paths.map((p, i) => (
            <g key={p.key} data-series={p.key}>
              {p.band && <path d={p.band} fill={series[i].color} fillOpacity={0.15} stroke="none" />}
              <path d={p.line} fill="none" stroke={series[i].color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
              {p.dots.map(([cx, cy]) => (
                <circle key={`${cx},${cy}`} cx={cx} cy={cy} r={2.5} fill={series[i].color} />
              ))}
            </g>
          ))}
        </g>

        {/* Hover and zoom selection */}
        {hover !== null && !drag && <line x1={hover} x2={hover} y1={TOP} y2={TOP + plotHeight} className="stroke-foreground/40" />}
        {tooltip.map(({ s, p }) => {
          const scale = scaleOf(s);
          return scale ? <circle key={s.key} cx={x(p[0])} cy={y(scale, scale.binary ? Math.round(p[1]) : p[1])} r={3.5} fill={s.color} className="stroke-background" strokeWidth={1.5} /> : null;
        })}
        {drag && Math.abs(drag.end - drag.start) > 2 && (
          <rect x={Math.min(drag.start, drag.end)} y={TOP} width={Math.abs(drag.end - drag.start)} height={plotHeight} className="fill-primary/15 stroke-primary/50" />
        )}
        <rect x={left} y={TOP} width={Math.max(0, plotWidth)} height={plotHeight} fill="transparent" className="cursor-crosshair" />
      </svg>
      {hoverTime !== null && tooltip.length > 0 && !drag && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-2 z-10 flex max-w-80 flex-col gap-1 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          style={hover! > width / 2 ? { right: width - hover! + 12 } : { left: hover! + 12 }}
        >
          <span className="text-muted-foreground">{tooltipFormat.format(hoverTime)}</span>
          {tooltip.map(({ s, p }) => (
            <span key={s.key} className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              <span className="font-medium tabular-nums">
                {formatValue(p[1], s.unit)}
                {p[3] > p[2] && !isBinary(s.points) && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    ({numberFormat.format(p[2])}–{numberFormat.format(p[3])})
                  </span>
                )}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
