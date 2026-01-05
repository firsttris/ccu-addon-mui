// Utility functions for ThermostatControl
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

export const getColor = (temperature: number) => {
  // Improved color gradient with smoother transitions
  if (temperature < 10) return '#0288D1'; // Deep Blue
  if (temperature < 14) return '#03A9F4'; // Light Blue
  if (temperature < 17) return '#00BCD4'; // Cyan
  if (temperature < 19) return '#26A69A'; // Teal
  if (temperature < 21) return '#66BB6A'; // Green
  if (temperature < 23) return '#9CCC65'; // Light Green
  if (temperature < 25) return '#FFA726'; // Orange
  if (temperature < 27) return '#FF7043'; // Deep Orange
  return '#EF5350'; // Red
};