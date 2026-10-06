import { describe, expect, it } from 'vitest';
import { DEFAULT_RANGE, temperatureRange } from './constants';

describe('temperatureRange', () => {
  it('uses the device limits within 5-30 °C, as the WebUI', () => {
    // The defaults of an HmIP-eTRV: off is 4.5 °C
    expect(temperatureRange({ TEMPERATURE_MINIMUM: 4.5, TEMPERATURE_MAXIMUM: 30.5 })).toEqual({ min: 5, max: 30, off: 4.5 });
    // Limits set on the device: the dial stays within them, off is the minimum
    expect(temperatureRange({ TEMPERATURE_MINIMUM: 10, TEMPERATURE_MAXIMUM: 24 })).toEqual({ min: 10, max: 24, off: 10 });
  });

  it('falls back to 5-30 °C without the limits', () => {
    expect(temperatureRange(undefined)).toBe(DEFAULT_RANGE);
    expect(temperatureRange({})).toBe(DEFAULT_RANGE);
  });
});
