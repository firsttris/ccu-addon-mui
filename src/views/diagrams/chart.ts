// Helpers of the diagrams: scales, axis ticks and the CSV export

// [time (ms), average, minimum, maximum]
export type ChartPoint = [number, number, number, number];

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  unit: string;
  points: ChartPoint[];
}

export const HOUR = 3600 * 1000;
export const DAY = 24 * HOUR;

export const periods = { day: DAY, week: 7 * DAY, month: 30 * DAY, year: 365 * DAY } as const;
export type Period = keyof typeof periods;

export const palette = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b', '#14b8a6', '#8b5cf6'];

// A series of only 0 and 1 (switches, contacts) is drawn as steps
export const isBinary = (points: ChartPoint[]) => points.length > 0 && points.every((p) => (p[2] === 0 || p[2] === 1) && (p[3] === 0 || p[3] === 1));

// Round numbers from min to max for an axis, about count of them
export const niceTicks = (min: number, max: number, count = 5): number[] => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    const pad = Math.abs(min) > 1 ? Math.abs(min) * 0.1 : 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 1e-9; v += step) {
    ticks.push(Math.round(v / step) * step);
  }
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks.map((v) => Number(v.toPrecision(12)));
};

// The value range of series, with a little room
export const valueRange = (series: ChartSeries[]): [number, number] | null => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) {
    for (const p of s.points) {
      lo = Math.min(lo, p[2]);
      hi = Math.max(hi, p[3]);
    }
  }
  if (lo > hi) return null;
  const ticks = niceTicks(lo, hi);
  return [ticks[0], ticks[ticks.length - 1]];
};

const timeSteps = [
  5 * 60 * 1000,
  15 * 60 * 1000,
  30 * 60 * 1000,
  HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
  DAY,
  2 * DAY,
  7 * DAY,
];

// Times for the x axis at round local hours, days or months
export const timeTicks = (from: number, to: number, count = 6): number[] => {
  const span = to - from;
  const step = timeSteps.find((s) => span / s <= count);
  const ticks: number[] = [];
  if (step) {
    const start = new Date(from);
    if (step >= DAY) {
      start.setHours(0, 0, 0, 0);
    } else {
      start.setMinutes(0, 0, 0);
    }
    for (let t = start.getTime(); t <= to; ) {
      if (t >= from) ticks.push(t);
      const next = new Date(t);
      if (step >= DAY) {
        // Days stay days across a change of daylight saving time
        next.setDate(next.getDate() + step / DAY);
      } else {
        next.setTime(t + step);
      }
      t = next.getTime();
    }
    return ticks;
  }
  const months = [1, 2, 3, 6, 12].find((n) => span / (n * 30 * DAY) <= count) ?? 12;
  const start = new Date(from);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  for (const d = start; d.getTime() <= to; d.setMonth(d.getMonth() + months)) {
    if (d.getTime() >= from) ticks.push(d.getTime());
  }
  return ticks;
};

// The point of a series nearest to a time
export const nearest = (points: ChartPoint[], t: number): ChartPoint | undefined => {
  if (points.length === 0) return undefined;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] < t) lo = mid + 1;
    else hi = mid;
  }
  const before = points[lo - 1];
  return before && t - before[0] < points[lo][0] - t ? before : points[lo];
};

const csvField = (text: string) => (/[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

// The averages of the series per time as CSV (semicolons and decimal
// commas for German spreadsheets when the language uses them)
export const toCSV = (series: ChartSeries[], decimalComma: boolean): string => {
  const times = [...new Set(series.flatMap((s) => s.points.map((p) => p[0])))].sort((a, b) => a - b);
  const byTime = series.map((s) => new Map(s.points.map((p) => [p[0], p[1]])));
  const number = (v: number | undefined) => {
    if (v === undefined) return '';
    const text = String(Math.round(v * 1000) / 1000);
    return decimalComma ? text.replace('.', ',') : text;
  };
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = (t: number) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const header = ['time', ...series.map((s) => (s.unit ? `${s.label} (${s.unit})` : s.label))].map(csvField).join(';');
  const rows = times.map((t) => [time(t), ...byTime.map((m) => number(m.get(t)))].join(';'));
  return [header, ...rows].join('\n') + '\n';
};

export type ChartKind = 'line' | 'area' | 'bar' | 'step' | 'state';
export type Aggregate = 'avg' | 'min' | 'max' | 'delta';
export type Interval = 'hour' | 'day' | 'week' | 'month';

// A bar from t0 to t1
export interface Bar {
  t0: number;
  t1: number;
  v: number;
}

// A series as drawn: points for lines, areas, steps and states, bars for
// bars, and the same of the period before for comparing (moved onto this
// period)
export interface RenderSeries {
  key: string;
  label: string;
  color: string;
  unit: string;
  kind: ChartKind;
  axis: '' | 'left' | 'right';
  aggregate: Aggregate;
  points: ChartPoint[];
  bars: Bar[];
  compare?: { points: ChartPoint[]; bars: Bar[] };
}

// How a series is drawn when nothing is chosen
export const defaultKind = (points: ChartPoint[], aggregate: Aggregate): ChartKind =>
  aggregate === 'delta' ? 'bar' : isBinary(points) ? 'step' : 'line';

// The calendar interval of bars for a range: hours for a day, days up to two
// months, months beyond
export const barInterval = (span: number): Interval => (span <= 2 * DAY ? 'hour' : span <= 62 * DAY ? 'day' : 'month');

export const intervalStart = (t: number, interval: Interval) => {
  const d = new Date(t);
  if (interval === 'hour') {
    d.setMinutes(0, 0, 0);
  } else {
    d.setHours(0, 0, 0, 0);
    if (interval === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    if (interval === 'month') d.setDate(1);
  }
  return d.getTime();
};

export const nextInterval = (t: number, interval: Interval) => {
  const d = new Date(t);
  if (interval === 'hour') d.setHours(d.getHours() + 1);
  else if (interval === 'day') d.setDate(d.getDate() + 1);
  else if (interval === 'week') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.getTime();
};

// Bars per calendar interval from from to to. For delta the points are
// counter readings (their maximum is the reading at the end of an
// interval): a bar is the increase since the interval before, points
// before from give the first one its start; a counter that started again
// from zero counts from there.
export const toBars = (points: ChartPoint[], from: number, to: number, interval: Interval, aggregate: Aggregate): Bar[] => {
  const bars: Bar[] = [];
  let i = 0;
  let previous: number | undefined;
  for (; i < points.length && points[i][0] < intervalStart(from, interval); i++) {
    previous = points[i][3];
  }
  for (let t0 = intervalStart(from, interval); t0 < to; ) {
    const t1 = nextInterval(t0, interval);
    const group: ChartPoint[] = [];
    for (; i < points.length && points[i][0] < t1; i++) group.push(points[i]);
    if (group.length > 0) {
      const lo = Math.min(...group.map((p) => p[2]));
      const hi = Math.max(...group.map((p) => p[3]));
      let v: number;
      if (aggregate === 'delta') {
        const start = previous ?? group[0][2];
        v = hi >= start ? hi - start : hi - lo;
        previous = hi;
      } else if (aggregate === 'min') {
        v = lo;
      } else if (aggregate === 'max') {
        v = hi;
      } else {
        v = group.reduce((sum, p) => sum + p[1], 0) / group.length;
      }
      bars.push({ t0, t1, v });
    }
    t0 = t1;
  }
  return bars;
};

// The points of a line for an aggregate: the average with its band, or
// only the minima or maxima
export const aggregatePoints = (points: ChartPoint[], aggregate: Aggregate): ChartPoint[] => {
  if (aggregate === 'min') return points.map((p) => [p[0], p[2], p[2], p[2]]);
  if (aggregate === 'max') return points.map((p) => [p[0], p[3], p[3], p[3]]);
  return points;
};

// Figures of a series in the range shown
export const seriesStats = (s: RenderSeries) => {
  if (s.kind === 'bar' || s.aggregate === 'delta') {
    const values = s.bars.map((b) => b.v);
    if (values.length === 0) return null;
    const sum = values.reduce((a, b) => a + b, 0);
    return { current: values[values.length - 1], min: Math.min(...values), max: Math.max(...values), avg: sum / values.length, sum };
  }
  if (s.points.length === 0) return null;
  const n = s.points.length;
  return {
    current: s.points[s.points.length - 1][1],
    min: Math.min(...s.points.map((p) => p[2])),
    max: Math.max(...s.points.map((p) => p[3])),
    avg: s.points.reduce((a, p) => a + p[1], 0) / n,
    sum: undefined as number | undefined,
  };
};

// At most n points, neighbours combined (lines of a year need no more
// points than pixels)
export const downsample = (points: ChartPoint[], n: number): ChartPoint[] => {
  if (points.length <= n) return points;
  const size = Math.ceil(points.length / n);
  const out: ChartPoint[] = [];
  for (let i = 0; i < points.length; i += size) {
    const group = points.slice(i, i + size);
    out.push([
      group[Math.floor(group.length / 2)][0],
      group.reduce((sum, p) => sum + p[1], 0) / group.length,
      Math.min(...group.map((p) => p[2])),
      Math.max(...group.map((p) => p[3])),
    ]);
  }
  return out;
};

// Large energy and power values in kWh and kW
export const scaleUnit = (unit: string, max: number): { unit: string; factor: number } =>
  (unit === 'Wh' || unit === 'W') && Math.abs(max) >= 10000 ? { unit: `k${unit}`, factor: 1 / 1000 } : { unit, factor: 1 };
