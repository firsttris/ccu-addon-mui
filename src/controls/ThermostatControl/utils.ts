// Utility functions for ThermostatControl
import { getTemperatureColor } from '../../utils/colors';

export const polarToCartesian = (
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
) => {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
};

export const createArcPath = (
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string => {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
};

export const xy2polar = (x: number, y: number) => {
  const r = Math.sqrt(x * x + y * y);
  let phi = Math.atan2(y, x);
  return { r, phi };
};

export const rad2deg = (rad: number) => {
  return (rad * 180) / Math.PI;
};

// Re-export the shared color function for backward compatibility
export const getColor = getTemperatureColor;