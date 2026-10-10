import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { defaultLang } from '../../i18n/locale';
import { useEffects } from '../../contexts/EffectsContext';
import { m } from '../../paraglide/messages';
import { isBinary, nearest, niceTicks, timeTicks, DAY, type Bar, type ChartPoint, type RenderSeries } from './chart';

const TOP = 14;
const BOTTOM = 26;
const AXIS = 46;
const LANE = 18;

const numberFormat = new Intl.NumberFormat(defaultLang, { maximumFractionDigits: 2 });
const tickNumber = new Intl.NumberFormat(defaultLang, { maximumFractionDigits: 1 });
const hourFormat = new Intl.DateTimeFormat(defaultLang, { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(defaultLang, { day: '2-digit', month: '2-digit' });
const monthFormat = new Intl.DateTimeFormat(defaultLang, { month: 'short', year: '2-digit' });
const tooltipFormat = new Intl.DateTimeFormat(defaultLang, {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatValue = (v: number, unit: string) => `${numberFormat.format(v)}${unit ? ` ${unit}` : ''}`;

interface Scale {
  key: string;
  unit: string;
  lo: number;
  hi: number;
  side: 'left' | 'right' | null;
}

// The typical distance of points; a much longer one is a gap
const typicalStep = (points: ChartPoint[]) => {
  if (points.length < 3) return Infinity;
  const deltas = points
    .slice(1)
    .map((p, i) => p[0] - points[i][0])
    .sort((a, b) => a - b);
  return deltas[deltas.length >> 1];
};

export const isBinaryValues = (s: RenderSeries) => s.kind !== 'bar' && isBinary(s.points);

// The scale a series uses: the side chosen, else one per unit; switches
// drawn as steps get one of their own from 0 to 1
const scaleKey = (s: RenderSeries) =>
  s.axis ? `axis:${s.axis}` : isBinaryValues(s) ? `bin:${s.key}` : `unit:${s.unit}`;

const barAt = (bars: Bar[], t: number) => bars.find((b) => t >= b.t0 && t < b.t1);

// A value as shown: on/off for states and switches
export const formatSeriesValue = (s: RenderSeries, v: number) =>
  s.kind === 'state' || (s.kind === 'step' && isBinaryValues(s))
    ? v >= 0.5
      ? m.ON()
      : m.OFF()
    : formatValue(v, s.unit);

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
  const delay = (i: number) => ({ '--chart-delay': `${strong ? i * 180 : 0}ms` }) as React.CSSProperties;
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

  const scales = useMemo(() => {
    const result = new Map<string, Scale>();
    for (const s of drawn) {
      const key = scaleKey(s);
      const scale = result.get(key) ?? { key, unit: s.unit, lo: Infinity, hi: -Infinity, side: null };
      const add = (points: ChartPoint[], list: Bar[]) => {
        if (s.kind === 'bar') {
          for (const v of [0, ...list.map((b) => b.v)]) {
            scale.lo = Math.min(scale.lo, v);
            scale.hi = Math.max(scale.hi, v);
          }
        } else {
          for (const p of points) {
            scale.lo = Math.min(scale.lo, p[2]);
            scale.hi = Math.max(scale.hi, p[3]);
          }
        }
      };
      add(s.points, s.bars);
      if (s.compare) add(s.compare.points, s.compare.bars);
      result.set(key, scale);
    }
    for (const scale of result.values()) {
      if (scale.key.startsWith('bin:') || scale.lo > scale.hi) {
        scale.lo = 0;
        scale.hi = 1;
      } else {
        const ticks = niceTicks(scale.lo, scale.hi);
        scale.lo = ticks[0];
        scale.hi = ticks[ticks.length - 1];
      }
    }
    // Sides: the chosen ones, then the units in order
    const list = [...result.values()];
    const left = result.get('axis:left') ?? list.find((s) => s.key.startsWith('unit:'));
    if (left) left.side = 'left';
    const right = result.get('axis:right') ?? list.find((s) => s.key.startsWith('unit:') && s !== left);
    if (right && right !== left) right.side = 'right';
    if (!left && !right && list.length === 1) list[0].side = 'left';
    return result;
  }, [drawn]);

  const axisLeft = [...scales.values()].find((s) => s.side === 'left');
  const axisRight = [...scales.values()].find((s) => s.side === 'right');
  const left = AXIS;
  const right = axisRight ? AXIS : 14;
  const plotWidth = width - left - right;
  const plotHeight = height - TOP - BOTTOM;
  const lanes = states.length > 0 ? states.length * LANE + 6 : 0;
  const lanesTop = TOP + plotHeight + 6;
  const total = height + lanes;

  const x = (t: number) => left + ((t - from) / (to - from)) * plotWidth;
  const timeAt = (px: number) => from + ((px - left) / plotWidth) * (to - from);
  const y = (scale: Scale, v: number) => {
    // Switches use the middle of the height, so their steps don't hide
    // under the axis
    if (scale.key.startsWith('bin:') && scales.size > 1) return TOP + plotHeight * 0.75 - v * plotHeight * 0.5;
    return TOP + plotHeight - ((v - scale.lo) / (scale.hi - scale.lo || 1)) * plotHeight;
  };
  const baseline = (scale: Scale) => y(scale, Math.min(Math.max(0, scale.lo), scale.hi));

  // Paths of a line, area or step series
  const linePaths = (s: RenderSeries, points: ChartPoint[], scale: Scale) => {
    const step = s.kind === 'step';
    const binary = isBinaryValues(s);
    const gap = points.length > 2 && !step ? Math.max(typicalStep(points) * 8, 30 * 60 * 1000) : Infinity;
    const base = baseline(scale);
    let line = '';
    let band = '';
    let area = '';
    const dots: [number, number][] = [];
    let segment: ChartPoint[] = [];
    const flush = () => {
      if (segment.length === 0) return;
      if (segment.length === 1 && !step) dots.push([x(segment[0][0]), y(scale, segment[0][1])]);
      if (!step && s.kind !== 'area' && s.aggregate === 'avg' && segment.some((p) => p[3] > p[2])) {
        const top = segment.map((p) => `${x(p[0]).toFixed(1)},${y(scale, p[3]).toFixed(1)}`);
        const bottom = segment.map((p) => `${x(p[0]).toFixed(1)},${y(scale, p[2]).toFixed(1)}`).reverse();
        band += `M${top.join('L')}L${bottom.join('L')}Z`;
      }
      if (s.kind === 'area' && segment.length > 1) {
        const pts = segment.map((p) => `${x(p[0]).toFixed(1)},${y(scale, p[1]).toFixed(1)}`);
        area += `M${x(segment[0][0]).toFixed(1)},${base.toFixed(1)}L${pts.join('L')}L${x(segment[segment.length - 1][0]).toFixed(1)},${base.toFixed(1)}Z`;
      }
      segment = [];
    };
    points.forEach((p, i) => {
      const prev = points[i - 1];
      const px = x(p[0]).toFixed(1);
      const py = y(scale, step && binary ? Math.round(p[1]) : p[1]).toFixed(1);
      if (!prev || p[0] - prev[0] > gap) {
        flush();
        line += `M${px},${py}`;
      } else if (step) {
        line += `H${px}V${py}`;
      } else {
        line += `L${px},${py}`;
      }
      segment.push(p);
    });
    flush();
    // The last value of a step lasts until now
    if (step && points.length > 0) line += `H${Math.min(x(Math.min(Date.now(), to)), left + plotWidth).toFixed(1)}`;
    return { line, band, area, dots };
  };

  // The paths and the typical spacing of the points change with the data
  // and the size, not while the pointer moves over the chart
  // biome-ignore lint/correctness/useExhaustiveDependencies: linePaths reads only these, through x, y and baseline
  const lineSeries = useMemo(() => {
    const result = new Map<
      string,
      { paths: ReturnType<typeof linePaths>; before: ReturnType<typeof linePaths> | null }
    >();
    for (const s of drawn) {
      const scale = scales.get(scaleKey(s));
      if (s.kind === 'bar' || !scale) continue;
      result.set(s.key, {
        paths: linePaths(s, s.points, scale),
        before: s.compare ? linePaths(s, s.compare.points, scale) : null,
      });
    }
    return result;
  }, [drawn, scales, width, height, from, to]);
  const steps = useMemo(() => new Map(series.map((s) => [s.key, typicalStep(s.points)])), [series]);

  const span = to - from;
  const xTicks = timeTicks(from, to, Math.max(3, Math.floor(plotWidth / 90)));
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
    hoverTime === null
      ? []
      : series.flatMap((s) => {
          if (s.kind === 'bar') {
            const bar = barAt(s.bars, hoverTime);
            const before = s.compare && barAt(s.compare.bars, hoverTime);
            return bar
              ? [{ s, v: bar.v, before: before?.v, at: (bar.t0 + bar.t1) / 2, range: null as [number, number] | null }]
              : [];
          }
          const p = nearest(s.points, hoverTime);
          const before = s.compare ? nearest(s.compare.points, hoverTime)?.[1] : undefined;
          if (!p || Math.abs(p[0] - hoverTime) > Math.max(span / 40, (steps.get(s.key) ?? Infinity) * 1.5)) {
            // A state or step lasts until the next value
            const last = s.points.findLast((q) => q[0] <= hoverTime);
            return (s.kind === 'state' || s.kind === 'step') && last
              ? [{ s, v: last[1], before, at: hoverTime, range: null }]
              : [];
          }
          return [
            {
              s,
              v: p[1],
              before,
              at: p[0],
              range: p[3] > p[2] && s.aggregate === 'avg' ? ([p[2], p[3]] as [number, number]) : null,
            },
          ];
        });

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
            const a = timeAt(Math.min(drag.start, drag.end));
            const b = timeAt(Math.max(drag.start, drag.end));
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

        {/* Grid and axes */}
        {axisLeft &&
          niceTicks(axisLeft.lo, axisLeft.hi).map((v) => (
            <g key={`l${v}`}>
              <line
                x1={left}
                x2={left + plotWidth}
                y1={y(axisLeft, v)}
                y2={y(axisLeft, v)}
                className="stroke-border"
                strokeDasharray="2 3"
              />
              <text
                x={left - 6}
                y={y(axisLeft, v)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {tickNumber.format(v)}
              </text>
            </g>
          ))}
        {axisRight &&
          niceTicks(axisRight.lo, axisRight.hi).map((v) => (
            <text
              key={`r${v}`}
              x={left + plotWidth + 6}
              y={y(axisRight, v)}
              dy="0.32em"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {tickNumber.format(v)}
            </text>
          ))}
        {axisLeft?.unit && (
          <text x={left - 6} y={TOP - 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
            {axisLeft.unit}
          </text>
        )}
        {axisRight?.unit && (
          <text x={left + plotWidth + 6} y={TOP - 4} className="fill-muted-foreground text-[10px]">
            {axisRight.unit}
          </text>
        )}
        {xTicks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={TOP} y2={TOP + plotHeight} className="stroke-border/60" />
            <text x={x(t)} y={total - 8} textAnchor="middle" className="fill-muted-foreground text-[11px] tabular-nums">
              {formatTick(t)}
            </text>
          </g>
        ))}
        <line x1={left} x2={left + plotWidth} y1={TOP + plotHeight} y2={TOP + plotHeight} className="stroke-border" />

        <g key={animationKey} className={effects.on ? 'chart-anim' : undefined} data-level={effects.level}>
          <g clipPath={`url(#${id}-clip)`}>
            {/* Bars, side by side per interval, the period before as outline */}
            {bars.map((s, bi) => {
              const scale = scales.get(scaleKey(s));
              if (!scale) return null;
              const base = baseline(scale);
              const rect = (b: Bar, outline: boolean) => {
                const slot = x(b.t1) - x(b.t0);
                const w = Math.max(1, (slot * 0.78) / bars.length);
                const bx = x(b.t0) + slot * 0.11 + bi * w;
                const by = y(scale, b.v);
                return (
                  <rect
                    key={`${outline ? 'c' : 'b'}${b.t0}`}
                    x={bx}
                    y={Math.min(by, base)}
                    width={Math.max(1, w - (bars.length > 1 ? 1 : 0))}
                    height={Math.max(outline ? 0 : 1, Math.abs(base - by))}
                    rx={Math.min(3, w / 4)}
                    fill={outline ? 'none' : s.color}
                    fillOpacity={outline ? undefined : 0.8}
                    stroke={outline ? s.color : 'none'}
                    strokeOpacity={0.6}
                    strokeDasharray={outline ? '3 2' : undefined}
                    className={outline ? 'chart-fill' : 'chart-bar'}
                    style={
                      outline
                        ? undefined
                        : ({
                            '--chart-delay': `${Math.min(600, bi * 120 + (x(b.t0) - left) * (strong ? 0.9 : 0.4))}ms`,
                          } as React.CSSProperties)
                    }
                  />
                );
              };
              return (
                <g key={s.key} data-series={s.key} data-kind="bar">
                  {s.compare?.bars.map((b) => rect(b, true))}
                  {s.bars.map((b) => rect(b, false))}
                </g>
              );
            })}
            {/* Lines, areas and steps */}
            {drawn
              .filter((s) => s.kind !== 'bar')
              .map((s, i) => {
                const drawing = lineSeries.get(s.key);
                if (!drawing) return null;
                const { paths, before } = drawing;
                return (
                  <g key={s.key} data-series={s.key} data-kind={s.kind}>
                    {before && (
                      <path
                        d={before.line}
                        className="chart-fill"
                        style={delay(i)}
                        fill="none"
                        stroke={s.color}
                        strokeOpacity={0.45}
                        strokeWidth={1.25}
                        strokeDasharray="4 3"
                      />
                    )}
                    {paths.area && (
                      <path
                        d={paths.area}
                        className="chart-fill"
                        style={delay(i)}
                        fill={`url(#${id}-g${drawn.indexOf(s)})`}
                        stroke="none"
                      />
                    )}
                    {paths.band && (
                      <path
                        d={paths.band}
                        className="chart-fill"
                        style={delay(i)}
                        fill={s.color}
                        fillOpacity={0.15}
                        stroke="none"
                      />
                    )}
                    <path
                      d={paths.line}
                      pathLength={1}
                      className="chart-line"
                      style={delay(i)}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={s.kind === 'area' ? 2 : 1.75}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    {paths.dots.map(([cx, cy]) => (
                      <circle
                        key={`${cx},${cy}`}
                        className="chart-fill"
                        style={delay(i)}
                        cx={cx}
                        cy={cy}
                        r={2.5}
                        fill={s.color}
                      />
                    ))}
                  </g>
                );
              })}
          </g>

          {/* States as bands below the chart */}
          {states.map((s, i) => {
            const top = lanesTop + i * LANE;
            const end = Math.min(Date.now(), to);
            return (
              <g key={s.key} data-series={s.key} data-kind="state" className="chart-lane" style={delay(i)}>
                <rect x={left} y={top} width={Math.max(0, plotWidth)} height={LANE - 4} rx={3} className="fill-muted" />
                {s.points.map((p, j) => {
                  if (p[1] < 0.5 && p[3] < 0.5) return null;
                  const t1 = s.points[j + 1]?.[0] ?? end;
                  const x0 = Math.max(left, x(p[0]));
                  const x1 = Math.min(left + plotWidth, x(t1));
                  return x1 > x0 ? (
                    <rect
                      key={p[0]}
                      x={x0}
                      y={top}
                      width={Math.max(1, x1 - x0)}
                      height={LANE - 4}
                      rx={2}
                      fill={s.color}
                      fillOpacity={0.85}
                    />
                  ) : null;
                })}
                <text
                  x={left + 6}
                  y={top + (LANE - 4) / 2}
                  dy="0.32em"
                  className="pointer-events-none fill-foreground/70 text-[10px] font-medium"
                  paintOrder="stroke"
                  stroke="var(--color-muted)"
                  strokeWidth={3}
                >
                  {s.label}
                </text>
              </g>
            );
          })}

          {/* The current value of live lines pulses */}
          {strong &&
            live &&
            drawn
              .filter((s) => s.kind === 'line' || s.kind === 'area')
              .map((s) => {
                const scale = scales.get(scaleKey(s));
                const last = s.points[s.points.length - 1];
                return scale && last ? (
                  <circle
                    key={s.key}
                    className="chart-pulse"
                    cx={x(last[0])}
                    cy={y(scale, last[1])}
                    r={3.5}
                    fill={s.color}
                  />
                ) : null;
              })}
        </g>

        {/* Hover and zoom selection */}
        {hover !== null && !drag && (
          <line x1={hover} x2={hover} y1={TOP} y2={TOP + plotHeight + lanes} className="stroke-foreground/40" />
        )}
        {tooltip.map(({ s, v, at }) => {
          const scale = scales.get(scaleKey(s));
          if (!scale || s.kind === 'state' || s.kind === 'bar') return null;
          return (
            <circle
              key={s.key}
              cx={x(at)}
              cy={y(scale, v)}
              r={3.5}
              fill={s.color}
              className="stroke-background"
              strokeWidth={1.5}
            />
          );
        })}
        {drag && Math.abs(drag.end - drag.start) > 2 && (
          <rect
            x={Math.min(drag.start, drag.end)}
            y={TOP}
            width={Math.abs(drag.end - drag.start)}
            height={plotHeight + lanes}
            className="fill-primary/15 stroke-primary/50"
          />
        )}
        <rect
          x={left}
          y={TOP}
          width={Math.max(0, plotWidth)}
          height={plotHeight + lanes}
          fill="transparent"
          className="cursor-crosshair"
        />
      </svg>
      {hover !== null && hoverTime !== null && tooltip.length > 0 && !drag && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-2 z-10 flex max-w-80 flex-col gap-1 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          style={hover > width / 2 ? { right: width - hover + 12 } : { left: hover + 12 }}
        >
          <span className="text-muted-foreground">{tooltipFormat.format(hoverTime)}</span>
          {tooltip.map(({ s, v, before, range }) => (
            <span key={s.key} className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              <span className="font-medium tabular-nums">
                {formatSeriesValue(s, v)}
                {range && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    ({numberFormat.format(range[0])}–{numberFormat.format(range[1])})
                  </span>
                )}
                {before !== undefined && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    · {m.DIAG_BEFORE({ value: formatSeriesValue(s, before) })}
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
