// Constants for the ThermostatControl component
export const RADIUS = 110;
export const MAX_ANGLE = 270;
export const ROTATE_ANGLE = 225; // Gap at bottom
export const CENTER_X = 130;
export const CENTER_Y = 130;
export const MIN_TEMP = 5;
export const MAX_TEMP = 30;
export const STEP = 0.5;
// The range the dial offers, and the setting for "off"
export interface TemperatureRange {
  min: number;
  max: number;
  off: number;
}

export const DEFAULT_RANGE: TemperatureRange = { min: MIN_TEMP, max: MAX_TEMP, off: 4.5 };

// As the WebUI's thermostat control (webui.js, iseThermostat): the device's
// TEMPERATURE_MINIMUM/MAXIMUM (MASTER), within 5-30 °C; "off" is 4.5 °C
// (offTemp) when the minimum allows it, else the minimum.
export const temperatureRange = (master?: Record<string, unknown>): TemperatureRange => {
  const confMin = Number(master?.TEMPERATURE_MINIMUM);
  const confMax = Number(master?.TEMPERATURE_MAXIMUM);
  if (!Number.isFinite(confMin) || !Number.isFinite(confMax) || confMin >= confMax) return DEFAULT_RANGE;
  return {
    min: confMin < MIN_TEMP ? MIN_TEMP : confMin,
    max: confMax > MAX_TEMP ? MAX_TEMP : confMax,
    off: confMin < MIN_TEMP ? 4.5 : confMin,
  };
};
