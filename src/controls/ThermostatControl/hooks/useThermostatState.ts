import { useState, useEffect, useRef } from 'react';
import { useSetDataPoint } from '../../../queries';
import { DEFAULT_RANGE, STEP, TemperatureRange } from '../constants';
import { Channel } from '../../../types/types';

interface UseThermostatStateProps {
  targetTemperature: number;
  channel: Channel;
  // HmIP: SET_POINT_TEMPERATURE, BidCos: SET_TEMPERATURE
  datapoint?: string;
  range?: TemperatureRange;
}

export const useThermostatState = ({
  targetTemperature,
  channel,
  datapoint = 'SET_POINT_TEMPERATURE',
  range = DEFAULT_RANGE,
}: UseThermostatStateProps) => {
  const setDataPoint = useSetDataPoint();
  const [localTarget, setLocalTarget] = useState(targetTemperature);
  const lastUserInteractionRef = useRef<number>(0);
  const commitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCommitRef = useRef<(() => void) | null>(null);

  // A value from the CCU waits until 3 seconds after the last user input,
  // so the dial doesn't jump while it is turned; it is not dropped: a
  // rollback after a refused change must show again.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = () => {
      const wait = lastUserInteractionRef.current + 3000 - Date.now();
      if (wait > 0) timer = setTimeout(apply, wait);
      else setLocalTarget(targetTemperature);
    };
    apply();
    return () => clearTimeout(timer);
  }, [targetTemperature]);

  const updateLocalTarget = (temp: number) => {
    lastUserInteractionRef.current = Date.now();
    setLocalTarget(temp);
  };

  const flushCommit = () => {
    if (commitTimeoutRef.current) {
      clearTimeout(commitTimeoutRef.current);
      commitTimeoutRef.current = null;
    }
    pendingCommitRef.current?.();
    pendingCommitRef.current = null;
  };

  // Debounced, so several quick steps result in a single radio telegram
  // (HmIP duty cycle) instead of one per click.
  const commitTemperatureChange = (temp: number) => {
    lastUserInteractionRef.current = Date.now();
    if (commitTimeoutRef.current) {
      clearTimeout(commitTimeoutRef.current);
    }
    pendingCommitRef.current = () =>
      setDataPoint(
        channel.interfaceName,
        channel.address,
        datapoint,
        temp
      );
    commitTimeoutRef.current = setTimeout(flushCommit, 500);
  };

  // Send a pending change right away when the control goes away (e.g. the
  // user navigates to another room) instead of dropping it.
  useEffect(() => flushCommit, []);

  const decreaseTemperature = () => {
    const newTemp = Math.max(range.min, localTarget - STEP);
    updateLocalTarget(newTemp);
    commitTemperatureChange(newTemp);
  };

  const increaseTemperature = () => {
    const newTemp = Math.min(range.max, localTarget + STEP);
    updateLocalTarget(newTemp);
    commitTemperatureChange(newTemp);
  };

  return {
    localTarget,
    updateLocalTarget,
    commitTemperatureChange,
    decreaseTemperature,
    increaseTemperature,
  };
};