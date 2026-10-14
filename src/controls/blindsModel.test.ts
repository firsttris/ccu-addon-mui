import { describe, expect, it } from 'vitest';
import { type BlindMove, FULL_TRAVEL_MS, positionOf, REPORT_GRACE_MS, reportOf, settle } from './blindsModel';

// From open (100 %) down to 40 %: 60 % of the full travel
const move: BlindMove = { from: 100, to: 40, startedAt: 0, seenMoving: false };
const duration = 0.6 * FULL_TRAVEL_MS;
const still = (level: number) => ({ level, moving: false });
const moving = (level: number) => ({ level, moving: true });

describe('reportOf', () => {
  it('reads moving from HmIP and BidCos', () => {
    expect(reportOf({ LEVEL: 1, ACTIVITY_STATE: 2, PROCESS: 1 })).toEqual(moving(100));
    expect(reportOf({ LEVEL: 0.4, ACTIVITY_STATE: 3, PROCESS: 0 })).toEqual(still(40));
    expect(reportOf({ LEVEL: 0.29, ACTIVITY_STATE: 0, PROCESS: 0 })).toEqual(still(29));
    expect(reportOf({ LEVEL: 0.5, WORKING: true, DIRECTION: 2 })).toEqual(moving(50));
    expect(reportOf({ LEVEL: 0.5, WORKING: false, DIRECTION: 0 })).toEqual(still(50));
  });
});

describe('positionOf', () => {
  it('travels from start to target at the estimated pace', () => {
    expect(positionOf(move, moving(100), 0)).toBe(100);
    expect(positionOf(move, moving(100), duration / 2)).toBe(70);
    expect(positionOf(move, moving(100), duration)).toBe(40);
    // And waits there for the actuator
    expect(positionOf(move, moving(100), duration * 2)).toBe(40);
  });

  it('jumps ahead to a position the actuator reports further along', () => {
    expect(positionOf(move, moving(55), duration / 2)).toBe(55);
    expect(positionOf(move, moving(90), duration / 2)).toBe(70);
  });

  it('ignores the level the app set itself before the actuator reports', () => {
    // The optimistic update has put LEVEL to the target already
    expect(positionOf(move, still(40), 0)).toBe(100);
  });

  it('stays where it was when stopped', () => {
    const stopped = { ...move, stoppedAt: duration / 2 };
    expect(positionOf(stopped, moving(100), duration)).toBe(70);
  });
});

describe('settle', () => {
  it('keeps travelling while the actuator reports the old position and moving', () => {
    const next = settle(move, moving(100), 500);
    expect(next).toEqual({ ...move, seenMoving: true });
    expect(next && settle(next, moving(100), duration)).toBe(next);
  });

  it('ends on arrival, or where the actuator stopped', () => {
    const seen = { ...move, seenMoving: true };
    expect(settle(seen, still(40), duration)).toBeNull();
    expect(settle(seen, still(65), 1000)).toBeNull();
  });

  it('waits for the first report, then ends if none says moving', () => {
    expect(settle(move, still(40), REPORT_GRACE_MS - 1)).toBe(move);
    expect(settle(move, still(40), REPORT_GRACE_MS)).toBeNull();
  });

  it('after stop waits for the actuator to report where it is', () => {
    const stopped = { ...move, seenMoving: true, stoppedAt: 5000 };
    expect(settle(stopped, still(70), 5000 + REPORT_GRACE_MS - 1)).toBe(stopped);
    expect(settle(stopped, still(70), 5000 + REPORT_GRACE_MS)).toBeNull();
  });

  it('gives up when the arrival is never reported', () => {
    expect(settle({ ...move, seenMoving: true }, moving(100), duration + 30001)).toBeNull();
  });
});
