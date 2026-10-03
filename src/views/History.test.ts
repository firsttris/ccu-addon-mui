import { describe, expect, it } from 'vitest';
import { datapointLabel, formatEntryValue } from './History';
import type { HistoryEntry } from '../types/protocol';
import { m } from '../paraglide/messages';

const entry = (e: Partial<HistoryEntry>): HistoryEntry => ({ group: 1, time: '2026-10-03 21:00:00', kind: 'channel', name: 'x', value: '', ...e });

describe('History', () => {
  it('makes values readable', () => {
    expect(formatEntryValue(entry({ datapoint: 'STATE', value: 'true' }))).toBe(m.ON());
    expect(formatEntryValue(entry({ datapoint: 'STATE', value: 'false' }))).toBe(m.OFF());
    expect(formatEntryValue(entry({ datapoint: 'LOWBAT', value: 'true' }))).toBe(m.HIST_YES());
    expect(formatEntryValue(entry({ datapoint: 'LEVEL', value: '0.5' }))).toBe('50 %');
    expect(formatEntryValue(entry({ datapoint: 'ACTUAL_TEMPERATURE', value: '21.456' }))).toMatch(/^21[.,]46$/);
    expect(formatEntryValue(entry({ kind: 'sysvar', value: '1', text: 'anwesend' }))).toBe('anwesend');
  });

  it('names datapoints', () => {
    expect(datapointLabel('STATE')).toBe(m.HIST_DP_STATE());
    expect(datapointLabel('OPERATING_VOLTAGE')).toBe('Operating voltage');
  });
});
