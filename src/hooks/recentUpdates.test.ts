import { describe, expect, it } from 'vitest';
import type { Channel } from '../types/types';
import { EVENT_GRACE_MS, RecentUpdates } from './recentUpdates';
import { RequestError, shouldRetry } from './useWebsocket';

const light = (on: boolean) =>
  ({
    id: 1,
    name: 'Licht',
    address: 'A:3',
    interfaceName: 'HmIP-RF',
    type: 'SWITCH_VIRTUAL_RECEIVER',
    statusAddress: 'A:0',
    datapoints: { STATE: on },
  }) as Channel;

const clock = () => {
  const c = { now: 100000, at: () => c.now };
  return c;
};

describe('RecentUpdates', () => {
  it('keeps an event that came in while the channels were loading', () => {
    const c = clock();
    const recent = new RecentUpdates(c.at);
    const startedAt = recent.time();
    c.now += 300;
    // The light is switched on while ReGa still answers with the old state
    recent.addEvent({ channel: 'A:3', datapoint: 'STATE', value: true });
    c.now += 300;
    const answer = [light(false)];
    expect(recent.channelsSince(answer, startedAt)[0].datapoints).toEqual({ STATE: true });
  });

  it('replays events from shortly before the request, but not older ones', () => {
    const c = clock();
    const recent = new RecentUpdates(c.at);
    recent.addEvent({ channel: 'A:3', datapoint: 'STATE', value: true });
    c.now += EVENT_GRACE_MS + 1;
    recent.addEvent({ channel: 'A:3', datapoint: 'LEVEL', value: 0.5 });
    c.now += EVENT_GRACE_MS - 1;
    const result = recent.channelsSince([light(false)], recent.time());
    expect(result[0].datapoints).toEqual({ STATE: false, LEVEL: 0.5 });
  });

  it('returns the answer itself when nothing came in', () => {
    const recent = new RecentUpdates(clock().at);
    const answer = [light(false)];
    expect(recent.channelsSince(answer, recent.time())).toBe(answer);
  });

  it('prefers a list pushed during the request', () => {
    const c = clock();
    const recent = new RecentUpdates(c.at);
    recent.setList('sysvars', ['before']);
    c.now += 10;
    const startedAt = recent.time();
    expect(recent.listSince('sysvars', startedAt)).toBeUndefined();
    c.now += 10;
    recent.setList('sysvars', ['pushed']);
    expect(recent.listSince('sysvars', startedAt)).toEqual(['pushed']);
    expect(recent.listSince('alarmMessages', startedAt)).toBeUndefined();
  });
});

describe('shouldRetry', () => {
  it('retries timeouts and CCU errors twice', () => {
    expect(shouldRetry(0, new RequestError('timed out', 'TIMEOUT'))).toBe(true);
    expect(shouldRetry(1, new RequestError('rega', 'CCU_ERROR'))).toBe(true);
    expect(shouldRetry(2, new RequestError('rega', 'CCU_ERROR'))).toBe(false);
    expect(shouldRetry(0, new Error('other'))).toBe(true);
  });

  it('does not retry a lost connection or a refusal', () => {
    for (const code of ['NOT_CONNECTED', 'FORBIDDEN', 'ELEVATION_REQUIRED', 'INVALID_REQUEST']) {
      expect(shouldRetry(0, new RequestError('no', code))).toBe(false);
    }
  });
});
