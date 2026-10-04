import { describe, expect, it } from 'vitest';
import { controlOverrides } from './registry';
import { meterSensor, passageDirection, tankVolume } from './MeterSensorControls';

describe('meter sensors', () => {
  it('computes the tank volume as capacitive_filling_level_sensor.fn', () => {
    // Vertical barrel 100 cm wide, 100 cm high, half full: π·50²·100·0.5 cm³
    expect(tankVolume({ CASE_DESIGN: 0, CASE_HIGH: 100, CASE_WIDTH: 100 }, 50)).toBe(393);
    // Rectangle 100 × 50 × 200 cm, a quarter full
    expect(tankVolume({ CASE_DESIGN: 2, CASE_HIGH: 100, CASE_WIDTH: 50, CASE_LENGTH: 200 }, 25)).toBe(250);
    // Horizontal barrel filled to the top at 100 %: the whole cylinder
    expect(tankVolume({ CASE_DESIGN: 1, CASE_HIGH: 100, CASE_WIDTH: 200, FILL_LEVEL: 100 }, 100)).toBe(1571);
    expect(tankVolume({ CASE_DESIGN: 2, CASE_HIGH: 100, CASE_WIDTH: 50 }, 25)).toBeUndefined();
    expect(tankVolume(undefined, 50)).toBeUndefined();
  });

  it('tells the attached sensor from METER_TYPE as isePowerMeter.getSensorType', () => {
    expect(meterSensor('POWERMETER_IEC1', 0)).toBe('gas');
    expect(meterSensor('POWERMETER_IEC1', 2)).toBe('electricity');
    expect(meterSensor('POWERMETER_IEC1', 3)).toBe('iec');
    expect(meterSensor('POWERMETER_IGL', 3)).toBe('unknown');
    expect(meterSensor('POWERMETER_IEC2', undefined)).toBe('iec');
    expect(meterSensor('POWERMETER', undefined)).toBe('electricity');
  });

  it('names the passage direction', () => {
    expect(passageDirection(false, true)).toBe('Left to right');
    expect(passageDirection(true, false)).toBe('Right to left');
    expect(passageDirection(false, false)).toBe('Unknown');
  });

  it('registers the tiles', () => {
    expect(controlOverrides.DISTANCE_TRANSMITTER?.section).toBe('sensors');
    expect(controlOverrides.PASSAGE_DETECTOR_DIRECTION_TRANSMITTER?.per).toBe('device');
    expect(controlOverrides.CAPACITIVE_FILLING_LEVEL_SENSOR?.section).toBe('sensors');
    expect(controlOverrides.POWERMETER_IEC1?.section).toBe('energy');
  });
});
