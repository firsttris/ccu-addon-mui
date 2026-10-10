import { describe, expect, it } from 'vitest';
import { controlOverrides } from './registry';

// Channel types as the CCU reports them (HMIPServer device descriptions,
// used in the WebUI's functions.fn, motiondetector.fn and alarmsirene.fn)
describe('controlOverrides', () => {
  it.each([
    'MOTION_DETECTOR',
    'MOTIONDETECTOR_TRANSCEIVER',
    'MOTIONDETECTOR_VIRTUAL_TRANSCEIVER',
    'PRESENCEDETECTOR_TRANSCEIVER',
  ])('shows %s as a motion detector', (type) => {
    expect(controlOverrides[type]).toMatchObject({
      per: 'channel',
      component: expect.objectContaining({ tileName: 'MotionDetectorControl' }),
    });
  });

  it('shows the HmIP-ASIR alarm channel as a siren', () => {
    expect(controlOverrides.ALARM_SWITCH_VIRTUAL_RECEIVER).toMatchObject({
      per: 'channel',
      component: expect.objectContaining({ tileName: 'SirenControl' }),
    });
  });
});
