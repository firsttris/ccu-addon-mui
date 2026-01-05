/**
 * Gemeinsame Farbfunktionen für verschiedene Controls
 */

/**
 * Gibt eine Farbe basierend auf der Temperatur zurück
 * Verwendet für Thermostat und Floor Controls
 */
export const getTemperatureColor = (temperature: number): string => {
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

/**
 * Gibt eine Farbe basierend auf einem Prozentsatz zurück (0-100)
 * Verwendet dieselbe Farbskala wie die Temperaturanzeige
 */
export const getPercentageColor = (percentage: number): string => {
  // Mappt 0-100% auf die Temperaturskala (0-30°C)
  const mappedTemp = (percentage / 100) * 30;
  return getTemperatureColor(mappedTemp);
};

/**
 * Erstellt einen Gradient basierend auf einem Prozentsatz
 */
export const getPercentageGradient = (percentage: number): string => {
  const color = getPercentageColor(percentage);
  
  if (percentage < 10) {
    return `linear-gradient(135deg, #01579B, ${color})`;
  } else if (percentage < 25) {
    return `linear-gradient(135deg, #0277BD, ${color})`;
  } else if (percentage < 40) {
    return `linear-gradient(135deg, #00838F, ${color})`;
  } else if (percentage < 55) {
    return `linear-gradient(135deg, #388E3C, ${color})`;
  } else if (percentage < 70) {
    return `linear-gradient(135deg, #F57C00, ${color})`;
  } else if (percentage < 85) {
    return `linear-gradient(135deg, #E64A19, ${color})`;
  } else {
    return `linear-gradient(135deg, #C62828, ${color})`;
  }
};
