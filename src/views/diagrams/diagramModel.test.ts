import { describe, expect, it } from 'vitest';
import { periods } from './chart';
import { boundsOf, csvFileName, shifted } from './diagramModel';

const now = 10 * periods.day;

describe('ranges', () => {
  it('ends now while live, earlier when moved back', () => {
    expect(boundsOf({ period: 'day', end: null }, now)).toEqual({
      from: now - periods.day,
      to: now,
      live: true,
      width: periods.day,
    });
    const earlier = shifted({ period: 'day', end: null }, -1, now);
    expect(earlier).toEqual({ period: 'day', end: now - periods.day });
    expect(boundsOf(earlier, now).live).toBe(false);
  });

  it('is live again when moved up to now', () => {
    expect(shifted({ period: 'week', end: now - periods.week }, 1, now)).toEqual({ period: 'week', end: null });
  });

  it('moves a zoomed span by its own width', () => {
    const zoom = { period: 'day' as const, from: now - 5000, to: now - 3000, zoomed: true as const };
    expect(shifted(zoom, -1, now)).toEqual({ ...zoom, from: now - 7000, to: now - 5000 });
  });
});

describe('csvFileName', () => {
  it('keeps letters and digits', () => {
    expect(csvFileName('Wohnzimmer Klima / 2026')).toBe('Wohnzimmer_Klima_2026.csv');
  });
});
