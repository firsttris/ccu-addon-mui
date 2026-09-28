import { useState, useEffect, useRef } from 'react';
import { useWebSocketActions } from '../../../hooks/useWebsocket';
import { MIN_TEMP, MAX_TEMP, STEP } from '../constants';
import { Channel } from '../../../types/types';

interface UseThermostatStateProps {
  targetTemperature: number;
  channel: Channel;
}

export const useThermostatState = ({ targetTemperature, channel }: UseThermostatStateProps) => {
  const { setDataPoint } = useWebSocketActions();
  const [localTarget, setLocalTarget] = useState(targetTemperature);
  const lastUserInteractionRef = useRef<number>(0);
  const commitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCommitRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Ignore backend updates for 3 seconds after user interaction to prevent jumping
    if (Date.now() - lastUserInteractionRef.current > 3000) {
      setLocalTarget(targetTemperature);
    }
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
        'SET_POINT_TEMPERATURE',
        temp
      );
    commitTimeoutRef.current = setTimeout(flushCommit, 500);
  };

  // Send a pending change right away when the control goes away (e.g. the
  // user navigates to another room) instead of dropping it.
  useEffect(() => flushCommit, []);

  const decreaseTemperature = () => {
    const newTemp = Math.max(MIN_TEMP, localTarget - STEP);
    updateLocalTarget(newTemp);
    commitTemperatureChange(newTemp);
  };

  const increaseTemperature = () => {
    const newTemp = Math.min(MAX_TEMP, localTarget + STEP);
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