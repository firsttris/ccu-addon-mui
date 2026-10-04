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
