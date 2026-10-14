// A blind's travel after a command, as the tile shows it. The actuator
// reports its old position first (HmIP: LEVEL unchanged with ACTIVITY_STATE
// UP/DOWN and PROCESS 1; BidCos: WORKING with DIRECTION) and the new one
// only on arrival. Shown as is, the shutter would jump back to where it was
// and later to the target. Instead it moves there at an estimated speed,
// faster if the actuator reports a position further along.

// Levels in percent, times in ms
export interface BlindMove {
  from: number;
  to: number;
  startedAt: number;
  // The actuator has reported moving since the command
  seenMoving: boolean;
  // Stop pressed: the shutter stays where it was estimated then
  stoppedAt?: number;
}

export interface BlindReport {
  level: number;
  moving: boolean;
}

// Bottom to top; actuators take some 15 to 30 s
export const FULL_TRAVEL_MS = 20000;
// Until the actuator reports moving: before, its state is the old one
export const REPORT_GRACE_MS = 3000;
// Without a report of arrival the move ends after its estimate and this
const TIMEOUT_MS = 30000;

const datapointOf = (datapoints: Record<string, unknown>, key: string) => Number(datapoints[key] ?? Number.NaN);

// What the channel reports: HmIP ACTIVITY_STATE 1 UP, 2 DOWN (3 STABLE,
// 0 UNKNOWN) and PROCESS 1 (not stable); BidCos WORKING, DIRECTION 1 UP,
// 2 DOWN
export const reportOf = (datapoints: Record<string, unknown>): BlindReport => {
  const activity = datapointOf(datapoints, 'ACTIVITY_STATE');
  const direction = datapointOf(datapoints, 'DIRECTION');
  return {
    // Rounded: e.g. 0.29 * 100 is 28.999999999999996 in floating point
    level: Math.round(Number(datapoints.LEVEL) * 100),
    moving:
      activity === 1 ||
      activity === 2 ||
      datapointOf(datapoints, 'PROCESS') === 1 ||
      datapoints.WORKING === true ||
      direction === 1 ||
      direction === 2,
  };
};

export const durationOf = (move: BlindMove) => Math.max(1000, (Math.abs(move.to - move.from) / 100) * FULL_TRAVEL_MS);

const clamp = (value: number) => Math.min(1, Math.max(0, value));

// Where the shutter is: the estimate, or the reported position if the
// actuator says it is further along
export const positionOf = (move: BlindMove, report: BlindReport, now: number) => {
  const elapsed = (move.stoppedAt ?? now) - move.startedAt;
  const estimated = clamp(elapsed / durationOf(move));
  const reported =
    report.moving && move.to !== move.from ? clamp((report.level - move.from) / (move.to - move.from)) : 0;
  return Math.round(move.from + (move.to - move.from) * Math.max(estimated, reported));
};

// The move after a look at the report: null once it is over, the same
// object while nothing changed
export const settle = (move: BlindMove, report: BlindReport, now: number): BlindMove | null => {
  if (now - move.startedAt > durationOf(move) + TIMEOUT_MS) return null;
  if (report.moving) return move.seenMoving ? move : { ...move, seenMoving: true };
  // Stopped: once the actuator had time to report where
  if (move.stoppedAt !== undefined) return now - move.stoppedAt < REPORT_GRACE_MS ? move : null;
  // Moved and now still: arrived, or stopped on the way (wall switch,
  // obstacle). Never seen moving: still the old state, or the actuator
  // arrived at once (or reports nothing in between)
  return move.seenMoving || now - move.startedAt >= REPORT_GRACE_MS ? null : move;
};
