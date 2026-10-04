import { describe, expect, it } from 'vitest';
import { DAY, HOUR, isBinary, nearest, niceTicks, timeTicks, toCSV, valueRange, type ChartPoint } from './chart';

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

describe('valueRange', () => {
  it('spans minima and maxima of all series', () => {
    const points: ChartPoint[] = [
      [0, 20, 19.2, 21],
      [1, 22, 21, 23.4],
    ];
    expect(valueRange([{ key: 'a', label: 'a', color: '', unit: '', points }])).toEqual([19, 24]);
    expect(valueRange([])).toBeNull();
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
