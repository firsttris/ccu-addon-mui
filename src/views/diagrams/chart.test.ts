import { describe, expect, it } from 'vitest';
import {
  DAY,
  HOUR,
  aggregatePoints,
  downsample,
  scaleUnit,
  barInterval,
  intervalStart,
  isBinary,
  nearest,
  niceTicks,
  seriesStats,
  timeTicks,
  toBars,
  toCSV,
  type ChartPoint,
} from './chart';

describe('niceTicks', () => {
  it('chooses round steps covering the range', () => {
    expect(niceTicks(18.3, 23.7)).toEqual([18, 20, 22, 24]);
    expect(niceTicks(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks(0, 2300)).toEqual([0, 500, 1000, 1500, 2000, 2500]);
  });
  it('widens a single value', () => {
    const ticks = niceTicks(21, 21);
    expect(ticks[0]).toBeLessThan(21);
    expect(ticks[ticks.length - 1]).toBeGreaterThan(21);
  });
});

describe('timeTicks', () => {
  it('ticks hours for a day and days for a week', () => {
    const from = new Date(2026, 9, 3, 12, 20).getTime();
    const hours = timeTicks(from, from + DAY);
    expect(hours.length).toBeGreaterThan(3);
    expect(hours.every((t) => new Date(t).getMinutes() === 0)).toBe(true);
    const days = timeTicks(from, from + 7 * DAY);
    expect(days.every((t) => new Date(t).getHours() === 0)).toBe(true);
  });
  it('ticks months for a year', () => {
    const from = new Date(2025, 9, 4).getTime();
    const months = timeTicks(from, from + 365 * DAY);
    expect(months.length).toBeGreaterThanOrEqual(4);
    expect(months.every((t) => new Date(t).getDate() === 1)).toBe(true);
  });
});

describe('nearest', () => {
  const points: ChartPoint[] = [
    [0, 1, 1, 1],
    [10, 2, 2, 2],
    [20, 3, 3, 3],
  ];
  it('finds the closest point', () => {
    expect(nearest(points, 4)?.[1]).toBe(1);
    expect(nearest(points, 6)?.[1]).toBe(2);
    expect(nearest(points, 99)?.[1]).toBe(3);
    expect(nearest([], 1)).toBeUndefined();
  });
});

describe('isBinary', () => {
  it('detects switch series', () => {
    expect(isBinary([[0, 0.5, 0, 1]])).toBe(true);
    expect(isBinary([[0, 0.5, 0.5, 0.5]])).toBe(false);
  });
});

describe('toCSV', () => {
  it('writes a column per series', () => {
    const t = new Date(2026, 9, 4, 12, 5).getTime();
    const csv = toCSV(
      [
        { key: 'a', label: 'Wohnzimmer; Temperatur', color: '', unit: '°C', points: [[t, 21.25, 21, 21.5]] },
        { key: 'b', label: 'Feuchte', color: '', unit: '%', points: [[t + HOUR, 40, 40, 40]] },
      ],
      true,
    );
    expect(csv).toBe('time;"Wohnzimmer; Temperatur (°C)";Feuchte (%)\n2026-10-04 12:05;21,25;\n2026-10-04 13:05;;40\n');
  });
});

describe('toBars', () => {
  const at = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime();
  // An energy counter: 100 Wh at the start, +10 on day 2, +5 on day 3, a
  // restart from zero on day 4
  const counter: ChartPoint[] = [
    [at(1, 23), 100, 100, 100],
    [at(2, 8), 104, 102, 106],
    [at(2, 20), 110, 108, 110],
    [at(3, 12), 115, 112, 115],
    [at(4, 6), 2, 0, 3],
  ];
  it('turns counter readings into consumption per day', () => {
    const bars = toBars(counter, at(2, 0), at(5, 0), 'day', 'delta');
    expect(bars.map((b) => b.v)).toEqual([10, 5, 3]);
    expect(bars[0].t0).toBe(at(2, 0));
    expect(bars[0].t1).toBe(at(3, 0));
  });
  it('averages, minima and maxima per interval', () => {
    expect(toBars(counter, at(2, 0), at(3, 0), 'day', 'avg').map((b) => b.v)).toEqual([107]);
    expect(toBars(counter, at(2, 0), at(3, 0), 'day', 'min').map((b) => b.v)).toEqual([102]);
    expect(toBars(counter, at(2, 0), at(3, 0), 'day', 'max').map((b) => b.v)).toEqual([110]);
  });
  it('chooses calendar intervals', () => {
    expect(barInterval(DAY)).toBe('hour');
    expect(barInterval(30 * DAY)).toBe('day');
    expect(barInterval(365 * DAY)).toBe('month');
    expect(new Date(intervalStart(at(15, 13), 'month')).getDate()).toBe(1);
    expect(new Date(intervalStart(at(8, 13), 'week')).getDay()).toBe(1);
  });
});

describe('aggregatePoints and seriesStats', () => {
  const points: ChartPoint[] = [
    [0, 2, 1, 3],
    [1, 4, 3, 6],
  ];
  it('picks minima or maxima', () => {
    expect(aggregatePoints(points, 'min').map((p) => p[1])).toEqual([1, 3]);
    expect(aggregatePoints(points, 'max').map((p) => p[1])).toEqual([3, 6]);
  });
  it('sums bars of a counter', () => {
    const s = {
      key: 'k',
      label: '',
      color: '',
      unit: 'Wh',
      kind: 'bar' as const,
      axis: '' as const,
      aggregate: 'delta' as const,
      points,
      bars: [
        { t0: 0, t1: 1, v: 10 },
        { t0: 1, t1: 2, v: 5 },
      ],
    };
    expect(seriesStats(s)).toEqual({ current: 5, min: 5, max: 10, avg: 7.5, sum: 15 });
    expect(seriesStats({ ...s, kind: 'line', aggregate: 'avg' })).toMatchObject({ current: 4, min: 1, max: 6, avg: 3 });
  });
});

describe('downsample and scaleUnit', () => {
  it('combines neighbours', () => {
    const points: ChartPoint[] = Array.from({ length: 10 }, (_, i) => [i, i, i - 1, i + 1]);
    const out = downsample(points, 5);
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual([1, 0.5, -1, 2]);
    expect(downsample(points, 20)).toBe(points);
  });
  it('switches to kWh and kW for large values', () => {
    expect(scaleUnit('Wh', 170000)).toEqual({ unit: 'kWh', factor: 0.001 });
    expect(scaleUnit('W', 900)).toEqual({ unit: 'W', factor: 1 });
    expect(scaleUnit('°C', 100000)).toEqual({ unit: '°C', factor: 1 });
  });
});

describe('costOf', async () => {
  const { costOf } = await import('./Diagrams');
  const price = { currency: 'EUR', electricity: 0.3, gas: 0.1, gasHeatingValue: 11, gasConditionNumber: 0.95 };
  it('prices electricity and gas', () => {
    expect(costOf(2000, 'Wh', price)).toBeCloseTo(0.6);
    expect(costOf(10, 'kWh', price)).toBeCloseTo(3);
    expect(costOf(100, 'm³', price)).toBeCloseTo(104.5);
    expect(costOf(10, '°C', price)).toBeNull();
    expect(costOf(10, 'kWh', undefined)).toBeNull();
  });
});
