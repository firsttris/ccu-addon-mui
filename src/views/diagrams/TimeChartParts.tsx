import type { CSSProperties } from 'react';
import { formatDate, formatNumber } from '../../lib/format';
import { m } from '../../paraglide/messages';
import { type Bar, DAY, niceTicks, type RenderSeries } from './chart';
import { type Geometry, isBinaryValues, LANE, type LinePaths, scaleKey, TOP, type TooltipRow } from './chartGeometry';

// The parts TimeChart draws, each from the chart's geometry

const hourStyle: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
const dayStyle: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' };
const monthStyle: Intl.DateTimeFormatOptions = { month: 'short', year: '2-digit' };
const tooltipStyle: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

export const formatValue = (v: number, unit: string) => `${formatNumber(v, 2)}${unit ? ` ${unit}` : ''}`;

// A value as shown: on/off for states and switches
export const formatSeriesValue = (s: RenderSeries, v: number) =>
  s.kind === 'state' || (s.kind === 'step' && isBinaryValues(s))
    ? v >= 0.5
      ? m.ON()
      : m.OFF()
    : formatValue(v, s.unit);

// The time axis: hours for up to two days, days for up to four months,
// months beyond
const formatTick = (t: number, span: number) => {
  if (span <= 2 * DAY) return formatDate(t, hourStyle);
  if (span <= 120 * DAY) return formatDate(t, dayStyle);
  return formatDate(t, monthStyle);
};

export type Delay = (i: number) => CSSProperties;

// The grid, the value axes on either side with their units, the time axis
export const ChartAxes = ({ g, xTicks, span }: { g: Geometry; xTicks: number[]; span: number }) => {
  const { left, plotWidth, plotHeight, x, y, axisLeft, axisRight, total } = g;
  return (
    <>
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
              {formatNumber(v, 1)}
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
            {formatNumber(v, 1)}
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
            {formatTick(t, span)}
          </text>
        </g>
      ))}
      <line x1={left} x2={left + plotWidth} y1={TOP + plotHeight} y2={TOP + plotHeight} className="stroke-border" />
    </>
  );
};

// Bars, side by side per interval, the period before as outline
export const ChartBars = ({ g, bars, strong }: { g: Geometry; bars: RenderSeries[]; strong: boolean }) => {
  const { left, x, y, baseline, scales } = g;
  return (
    <>
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
    </>
  );
};

// Lines, areas and steps
export const ChartLines = ({
  drawn,
  lineSeries,
  id,
  delay,
}: {
  drawn: RenderSeries[];
  lineSeries: Map<string, { paths: LinePaths; before: LinePaths | null }>;
  id: string;
  delay: Delay;
}) => (
  <>
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
  </>
);

// States as bands below the chart
export const StateLanes = ({ g, states, delay }: { g: Geometry; states: RenderSeries[]; delay: Delay }) => {
  const { left, plotWidth, x, lanesTop, to } = g;
  return (
    <>
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
    </>
  );
};

// The current value of live lines pulses
export const LivePulse = ({
  g,
  drawn,
  strong,
  live,
}: {
  g: Geometry;
  drawn: RenderSeries[];
  strong: boolean;
  live: boolean;
}) => {
  const { x, y, scales } = g;
  return (
    <>
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
    </>
  );
};

// The line under the pointer, the points of its values and the zoom selection
export const PointerMarks = ({
  g,
  hover,
  drag,
  tooltip,
}: {
  g: Geometry;
  hover: number | null;
  drag: { start: number; end: number } | null;
  tooltip: TooltipRow[];
}) => {
  const { plotHeight, x, y, scales, lanes } = g;
  return (
    <>
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
    </>
  );
};

// The values at the pointer, beside it
export const ChartTooltip = ({
  hover,
  hoverTime,
  drag,
  tooltip,
  width,
}: {
  hover: number | null;
  hoverTime: number | null;
  drag: { start: number; end: number } | null;
  tooltip: TooltipRow[];
  width: number;
}) => (
  <>
    {hover !== null && hoverTime !== null && tooltip.length > 0 && !drag && (
      <div
        role="tooltip"
        className="pointer-events-none absolute top-2 z-10 flex max-w-80 flex-col gap-1 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
        style={hover > width / 2 ? { right: width - hover + 12 } : { left: hover + 12 }}
      >
        <span className="text-muted-foreground">{formatDate(hoverTime, tooltipStyle)}</span>
        {tooltip.map(({ s, v, before, range }) => (
          <span key={s.key} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className="font-medium tabular-nums">
              {formatSeriesValue(s, v)}
              {range && (
                <span className="ml-1 font-normal text-muted-foreground">
                  ({formatNumber(range[0], 2)}–{formatNumber(range[1], 2)})
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
  </>
);
