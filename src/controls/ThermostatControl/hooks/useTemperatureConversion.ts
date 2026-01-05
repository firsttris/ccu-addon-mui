import { useCallback } from 'react';
import { MAX_ANGLE, MIN_TEMP, MAX_TEMP, STEP } from '../constants';

export const useTemperatureConversion = () => {
  // Convert temperature to angle (0-270 degrees)
  const tempToAngle = useCallback((temp: number) => {
    const clampedTemp = Math.max(MIN_TEMP, Math.min(MAX_TEMP, temp));
    const percentage = (clampedTemp - MIN_TEMP) / (MAX_TEMP - MIN_TEMP);
    return percentage * MAX_ANGLE;
  }, []);

  // Convert angle to temperature
  const angleToTemp = useCallback((angle: number) => {
    const percentage = Math.max(0, Math.min(1, angle / MAX_ANGLE));
    const temp = MIN_TEMP + percentage * (MAX_TEMP - MIN_TEMP);
    // Round to nearest step
    return Math.round(temp / STEP) * STEP;
  }, []);

  return { tempToAngle, angleToTemp };
};