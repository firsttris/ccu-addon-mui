// Colors shared by the controls

// A color for a temperature, from deep blue (cold) to red (hot); the
// thermostat and floor heating use it
export const getTemperatureColor = (temperature: number): string => {
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
