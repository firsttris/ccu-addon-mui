import { useEffect, useState } from 'react';
import { type BlindMove, type BlindReport, positionOf, settle } from './blindsModel';

// How often the estimated position moves on while the shutter travels
const TICK_MS = 250;

// The shutter's travel after a command (blindsModel.ts): level is where it
// is shown, target where it goes (null when it stands)
export const useBlindMove = (report: BlindReport) => {
  const [move, setMove] = useState<BlindMove | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!move) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [move]);
  useEffect(() => {
    if (!move) return;
    const next = settle(move, report, now);
    if (next !== move) setMove(next);
  }, [move, report, now]);

  const level = move ? positionOf(move, report, now) : report.level;
  const start = (to: number) => {
    const at = Date.now();
    setNow(at);
    setMove({ from: level, to, startedAt: at, seenMoving: false });
  };
  const stop = () => {
    if (!move || move.stoppedAt !== undefined) return;
    const at = Date.now();
    setNow(at);
    setMove({ ...move, stoppedAt: at });
  };
  return { level, target: move && move.stoppedAt === undefined ? move.to : null, start, stop };
};
