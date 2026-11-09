import { describe, expect, it } from 'vitest';
import { datapointLabel, emptyText, formatEntryValue } from './History';
import { RequestError } from '../hooks/useWebsocket';
import type { HistoryEntry } from '../types/protocol';
import { m } from '../paraglide/messages';

const entry = (e: Partial<HistoryEntry>): HistoryEntry => ({
  group: 1,
  time: '2026-10-03 21:00:00',
  kind: 'channel',
  name: 'x',
  value: '',
  ...e,
});

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

  // A protocol the server could not read is not shown as empty (#299)
  it('tells a failed read from an empty protocol', () => {
    const failed = emptyText(new RequestError('getHistory failed: script stopped before its end', 'CCU_ERROR'), 0);
    expect(failed).toContain(m.HIST_LOAD_FAILED());
    expect(failed).not.toBe(m.HIST_EMPTY());
    expect(emptyText(null, 0)).toBe(m.HIST_EMPTY());
    expect(emptyText(null, 12)).toBe(m.NO_RESULTS());
  });

  // Entries are loaded and shown in the count; a later page or a refetch that
  // failed does not turn a search without hits into an unreadable protocol
  it('keeps "no results" for a search when entries are loaded', () => {
    const error = new RequestError('getHistory failed: script stopped before its end', 'CCU_ERROR');
    expect(emptyText(error, 12)).toBe(m.NO_RESULTS());
  });
});
