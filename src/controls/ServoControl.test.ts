import { describe, expect, it } from 'vitest';
import './registry';
import { servoPosition } from './ServoControl';
import { controlOverrides } from './registry';

describe('servo', () => {
  it('names the position from left over neutral to right', () => {
    expect(servoPosition(50)).toBe('Neutral (50 %)');
    expect(servoPosition(12.5)).toBe('Left · 12.5 %');
    expect(servoPosition(80)).toBe('Right · 80 %');
  });

  it('puts servos into the drives and the alarm output into water', () => {
    expect(controlOverrides.SERVO_VIRTUAL_RECEIVER?.section).toBe('drives');
    expect(controlOverrides.SERVO_TRANSMITTER?.section).toBe('drives');
    expect(controlOverrides.ALARM_ACTUATOR_RECEIVER?.section).toBe('water');
  });
});
