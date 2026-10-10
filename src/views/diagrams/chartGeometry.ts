import { type Bar, type ChartPoint, isBinary, nearest, niceTicks, type RenderSeries } from './chart';

// Where the time chart draws what: scales, positions, paths and the
// values under the pointer. Pure functions; TimeChart.tsx draws them.

export const TOP = 14;
export const BOTTOM = 26;
export const AXIS = 46;
export const LANE = 18;

export interface Scale {
  key: string;
  unit: string;
  lo: number;
  hi: number;
  side: 'left' | 'right' | null;
}

// The typical distance of points; a much longer one is a gap
export const typicalStep = (points: ChartPoint[]) => {
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
export const scaleKey = (s: RenderSeries) =>
  s.axis ? `axis:${s.axis}` : isBinaryValues(s) ? `bin:${s.key}` : `unit:${s.unit}`;

const barAt = (bars: Bar[], t: number) => bars.find((b) => t >= b.t0 && t < b.t1);

// The scales of the drawn series (not the states), rounded to their ticks,
// and on which side each has its axis
export const scalesOf = (drawn: RenderSeries[]) => {
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
};

export type Geometry = ReturnType<typeof geometryOf>;

// The chart's measures and the mapping of time and values to pixels
export const geometryOf = ({
  width,
  height,
  from,
  to,
  scales,
  states,
}: {
  width: number;
  height: number;
  from: number;
  to: number;
  scales: Map<string, Scale>;
  // The number of state lanes below the chart
  states: number;
}) => {
  const axisLeft = [...scales.values()].find((s) => s.side === 'left');
  const axisRight = [...scales.values()].find((s) => s.side === 'right');
  const left = AXIS;
  const right = axisRight ? AXIS : 14;
  const plotWidth = width - left - right;
  const plotHeight = height - TOP - BOTTOM;
  const lanes = states > 0 ? states * LANE + 6 : 0;
  const y = (scale: Scale, v: number) => {
    // Switches use the middle of the height, so their steps don't hide
    // under the axis
    if (scale.key.startsWith('bin:') && scales.size > 1) return TOP + plotHeight * 0.75 - v * plotHeight * 0.5;
    return TOP + plotHeight - ((v - scale.lo) / (scale.hi - scale.lo || 1)) * plotHeight;
  };
  return {
    from,
    to,
    width,
    scales,
    axisLeft,
    axisRight,
    left,
    plotWidth,
    plotHeight,
    lanes,
    lanesTop: TOP + plotHeight + 6,
    total: height + lanes,
    x: (t: number) => left + ((t - from) / (to - from)) * plotWidth,
    timeAt: (px: number) => from + ((px - left) / plotWidth) * (to - from),
    y,
    baseline: (scale: Scale) => y(scale, Math.min(Math.max(0, scale.lo), scale.hi)),
  };
};

// Paths of a line, area or step series
export const linePaths = (g: Geometry, s: RenderSeries, points: ChartPoint[], scale: Scale) => {
  const { x, y } = g;
  const step = s.kind === 'step';
  const binary = isBinaryValues(s);
  const gap = points.length > 2 && !step ? Math.max(typicalStep(points) * 8, 30 * 60 * 1000) : Infinity;
  const base = g.baseline(scale);
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
  if (step && points.length > 0) line += `H${Math.min(x(Math.min(Date.now(), g.to)), g.left + g.plotWidth).toFixed(1)}`;
  return { line, band, area, dots };
};

export type LinePaths = ReturnType<typeof linePaths>;

export interface TooltipRow {
  s: RenderSeries;
  v: number;
  // The value of the period before
  before?: number;
  // Where the value is
  at: number;
  // Minimum and maximum of an averaged value
  range: [number, number] | null;
}

// The values of the series at time t, as the tooltip lists them; steps
// holds the typical spacing of each series' points
export const tooltipRows = (
  series: RenderSeries[],
  t: number,
  span: number,
  steps: Map<string, number>,
): TooltipRow[] =>
  series.flatMap((s) => {
    if (s.kind === 'bar') {
      const bar = barAt(s.bars, t);
      const before = s.compare && barAt(s.compare.bars, t);
      return bar ? [{ s, v: bar.v, before: before?.v, at: (bar.t0 + bar.t1) / 2, range: null }] : [];
    }
    const p = nearest(s.points, t);
    const before = s.compare ? nearest(s.compare.points, t)?.[1] : undefined;
    if (!p || Math.abs(p[0] - t) > Math.max(span / 40, (steps.get(s.key) ?? Infinity) * 1.5)) {
      // A state or step lasts until the next value
      const last = s.points.findLast((q) => q[0] <= t);
      return (s.kind === 'state' || s.kind === 'step') && last ? [{ s, v: last[1], before, at: t, range: null }] : [];
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
