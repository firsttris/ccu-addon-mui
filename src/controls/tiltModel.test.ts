import { describe, expect, it } from 'vitest';
import { doorState, isTiltTile } from './tiltModel';

// Operation modes as in hmipChannelConfigDialogs.tcl (getAccelerationTransceiver):
// 1 vibration, 2 position change, 3 tilt change
describe('a tilt sensor as door or flap', () => {
  it('is open or closed when horizontal, as it is mounted', () => {
    expect(doorState({ MOTION: false }, 2, 'horizontalOpen')).toBe('open');
    expect(doorState({ MOTION: true }, 2, 'horizontalOpen')).toBe('closed');
    expect(doorState({ MOTION: false }, 2, 'horizontalClosed')).toBe('closed');
    expect(doorState({ MOTION: true }, 2, 'horizontalClosed')).toBe('open');
  });

  // ELV-SH-CTV, -TACO: STATE 0 horizontal, 1 tilted, 2 vertical
  it('reads the three positions, tilted being half way', () => {
    expect(doorState({ STATE: 0 }, 3, 'horizontalClosed')).toBe('closed');
    expect(doorState({ STATE: 1 }, 3, 'horizontalClosed')).toBe('partlyOpen');
    expect(doorState({ STATE: 2 }, 3, 'horizontalClosed')).toBe('open');
    expect(doorState({ STATE: 2 }, 3, 'horizontalOpen')).toBe('closed');
    // Position change knows only horizontal or not
    expect(doorState({ STATE: 1 }, 2, 'horizontalOpen')).toBe('closed');
    expect(doorState({ STATE: 0 }, 2, 'horizontalOpen')).toBe('open');
  });

  it('tells nothing from vibration or a bare angle', () => {
    expect(doorState({ MOTION: true }, 1, 'horizontalOpen')).toBeUndefined();
    expect(doorState({ ABSOLUTE_ANGLE: 40 }, 3, 'horizontalOpen')).toBeUndefined();
    expect(doorState({ MOTION: false }, undefined, 'horizontalOpen')).toBeUndefined();
  });

  it('is chosen by the tile', () => {
    expect(isTiltTile('horizontalOpen')).toBe(true);
    expect(isTiltTile('horizontalClosed')).toBe(true);
    expect(isTiltTile('light')).toBe(false);
    expect(isTiltTile(undefined)).toBe(false);
  });
});
