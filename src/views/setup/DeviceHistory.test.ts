import { describe, expect, it } from 'vitest';
import { linePath, toSeries } from './DeviceHistory';
import type { HistoryEntry } from '../../types/protocol';

const entry = (time: string, value: string, datapoint = 'ACTUAL_TEMPERATURE'): HistoryEntry => ({
  group: 1,
  time,
  kind: 'channel',
  name: 'x',
  datapoint,
  value,
});

describe('DeviceHistory', () => {
  it('turns numbers into a series, oldest first', () => {
    const series = toSeries([entry('2026-10-03 21:00:00', '21.5'), entry('2026-10-03 20:00:00', '20')]);
    expect(series?.map((p) => p.v)).toEqual([20, 21.5]);
    expect(toSeries([entry('2026-10-03 21:00:00', '0.5', 'LEVEL')])?.[0].v).toBe(50);
  });

  it('has no series for other values', () => {
    expect(toSeries([entry('2026-10-03 21:00:00', 'true', 'STATE')])).toBeNull();
    expect(toSeries([entry('2026-10-03 21:00:00', '')])).toBeNull();
  });

  it('draws the series across the box', () => {
    expect(linePath([])).toBe('');
    expect(
      linePath([
        { t: 0, v: 1 },
        { t: 10, v: 3 },
      ]),
    ).toBe('M4.0,92.0 L316.0,4.0');
    expect(
      linePath([
        { t: 0, v: 2 },
        { t: 10, v: 2 },
      ]),
    ).toBe('M4.0,48.0 L316.0,48.0');
  });
});
