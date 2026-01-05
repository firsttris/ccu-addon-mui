import { useState, useEffect, useRef } from 'react';
import { useWebSocketContext } from '../../../hooks/useWebsocket';
import { MIN_TEMP, MAX_TEMP, STEP } from '../constants';
import { Channel } from '../../../types/types';

interface UseThermostatStateProps {
  targetTemperature: number;
  channel: Channel;
}

export const useThermostatState = ({ targetTemperature, channel }: UseThermostatStateProps) => {
  const { setDataPoint } = useWebSocketContext();
  const [localTarget, setLocalTarget] = useState(targetTemperature);
  const lastUserInteractionRef = useRef<number>(0);

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

  const commitTemperatureChange = (temp: number) => {
    setDataPoint(
      channel.interfaceName,
      channel.address,
      'SET_POINT_TEMPERATURE',
      temp
    );
  };

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