import { describe, expect, it } from 'vitest';
// The registry first, as in the app (queries import it, the controls them)
import { controlOverrides } from './registry';
import {
  BrightnessControl,
  co2Rating,
  measured,
  pmRating,
  RainSensorControl,
  soilRating,
  TiltSensorControl,
  tiltReading,
} from './SensorControls';
import { m } from '../paraglide/messages';

describe('sensor tiles', () => {
  it('are registered for their channel types', () => {
    expect(controlOverrides.RAIN_DETECTION_TRANSMITTER).toMatchObject({ section: 'sensors', component: RainSensorControl });
    expect(controlOverrides.LUXMETER).toMatchObject({ section: 'sensors', component: BrightnessControl });
    expect(controlOverrides.ACCELERATION_TRANSCEIVER).toMatchObject({ section: 'security', component: TiltSensorControl });
  });

  // *_STATUS: NORMAL is 0, anything else (UNKNOWN, OVERFLOW …) is no value
  it('takes a value only while its status is normal', () => {
    expect(measured({ CONCENTRATION: 640 }, 'CONCENTRATION')).toBe(640);
    expect(measured({ CONCENTRATION: 640, CONCENTRATION_STATUS: 0 }, 'CONCENTRATION')).toBe(640);
    expect(measured({ CONCENTRATION: 0, CONCENTRATION_STATUS: 1 }, 'CONCENTRATION')).toBeUndefined();
    expect(measured({}, 'CONCENTRATION')).toBeUndefined();
  });

  it('rates CO₂ as the UBA does', () => {
    expect(co2Rating(650)).toBe('good');
    expect(co2Rating(1000)).toBe('poor');
    expect(co2Rating(2000)).toBe('poor');
    expect(co2Rating(2400)).toBe('bad');
  });

  it('rates PM2.5 by the European Air Quality Index', () => {
    expect(pmRating(4)).toBe('PM_GOOD');
    expect(pmRating(18)).toBe('PM_FAIR');
    expect(pmRating(24)).toBe('PM_MODERATE');
    expect(pmRating(40)).toBe('PM_POOR');
    expect(pmRating(70)).toBe('PM_VERY_POOR');
    expect(pmRating(120)).toBe('PM_EXTREMELY_POOR');
  });

  it('rates soil moisture', () => {
    expect(soilRating(12)).toBe('SOIL_DRY');
    expect(soilRating(45)).toBe('SOIL_MOIST');
    expect(soilRating(85)).toBe('SOIL_WET');
  });

  // iseAccelerationTransceiver / iseAccelerationTransceiverTaco (webui.js)
  it('reads a tilt sensor by its operation mode', () => {
    expect(tiltReading({ MOTION: true }, 1)).toMatchObject({ value: m.YES(), active: true });
    expect(tiltReading({ MOTION: false }, 2)).toMatchObject({ value: m.TILT_HORIZONTAL(), active: false });
    expect(tiltReading({ MOTION: true }, 2)).toMatchObject({ value: m.TILT_NOT_HORIZONTAL(), active: true });
    expect(tiltReading({ MOTION: false, ABSOLUTE_ANGLE: 37 }, 3)).toMatchObject({ value: '37°' });
    // Three positions: mode 2 knows two of them, mode 3 all three
    expect(tiltReading({ MOTION: false, STATE: 2, ABSOLUTE_ANGLE: 88 }, 2)).toMatchObject({ value: m.TILT_TILTED() });
    expect(tiltReading({ MOTION: false, STATE: 2, ABSOLUTE_ANGLE: 88 }, 3)).toMatchObject({ value: m.TILT_VERTICAL() });
    expect(tiltReading({ MOTION: false }, 0)).toBeUndefined();
  });
});
