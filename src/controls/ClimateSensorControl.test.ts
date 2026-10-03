import { describe, expect, it } from 'vitest';
import { comfort, dewPoint } from './ClimateSensorControl';

describe('dewPoint', () => {
  it('follows the Magnus formula', () => {
    // Reference values: 20 °C / 50 % → 9.3 °C, 25 °C / 80 % → 21.3 °C
    expect(dewPoint(20, 50)).toBeCloseTo(9.3, 1);
    expect(dewPoint(25, 80)).toBeCloseTo(21.3, 1);
    // Saturated air: the dew point is the temperature
    expect(dewPoint(15, 100)).toBeCloseTo(15, 5);
  });
});

describe('comfort', () => {
  it('rates indoor humidity', () => {
    expect(comfort(30)).toBe('dry');
    expect(comfort(50)).toBe('comfortable');
    expect(comfort(70)).toBe('humid');
  });
});
