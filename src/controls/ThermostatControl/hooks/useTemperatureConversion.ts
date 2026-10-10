import { useCallback } from 'react';
import { DEFAULT_RANGE, MAX_ANGLE, STEP, type TemperatureRange } from '../constants';

export const useTemperatureConversion = ({ min, max }: TemperatureRange = DEFAULT_RANGE) => {
  // Convert temperature to angle (0-270 degrees)
  const tempToAngle = useCallback(
    (temp: number) => {
      const clampedTemp = Math.max(min, Math.min(max, temp));
      const percentage = (clampedTemp - min) / (max - min);
      return percentage * MAX_ANGLE;
    },
    [min, max],
  );

  // Convert angle to temperature
  const angleToTemp = useCallback(
    (angle: number) => {
      const percentage = Math.max(0, Math.min(1, angle / MAX_ANGLE));
      const temp = min + percentage * (max - min);
      // Round to nearest step
      return Math.round(temp / STEP) * STEP;
    },
    [min, max],
  );

  return { tempToAngle, angleToTemp };
};
