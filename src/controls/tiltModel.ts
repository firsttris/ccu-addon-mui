import type { DatapointValue } from '../types/types';

// A tilt sensor on a garage door or a flap: whether horizontal means open
// or closed depends on how it is mounted, which neither the device nor the
// WebUI knows. The tile chosen for the channel in the setup area says it.
export type TiltTile = 'horizontalOpen' | 'horizontalClosed';
export type DoorState = 'open' | 'closed' | 'partlyOpen';

export const isTiltTile = (tile: string | undefined): tile is TiltTile =>
  tile === 'horizontalOpen' || tile === 'horizontalClosed';

// The door's state from the sensor's position, by its operation mode
// (MASTER CHANNEL_OPERATION_MODE, as iseAccelerationTransceiver and
// iseAccelerationTransceiverTaco in webui.js): 2 position knows horizontal
// or not (MOTION, or STATE 0 horizontal, 1 and 2 tilted), 3 with three
// positions horizontal, tilted and vertical (STATE 0, 1, 2), tilted being
// half way. Vibration (1) and a bare angle (3 without STATE) tell no
// position: undefined.
export const doorState = (
  dp: Record<string, DatapointValue>,
  mode: number | undefined,
  tile: TiltTile,
): DoorState | undefined => {
  const flat: DoorState = tile === 'horizontalOpen' ? 'open' : 'closed';
  const upright: DoorState = flat === 'open' ? 'closed' : 'open';
  const taco = dp.STATE !== undefined && dp.STATE !== null;
  const position = typeof dp.STATE === 'number' && dp.STATE >= 0 && dp.STATE <= 2 ? dp.STATE : undefined;
  if (mode === 2) {
    if (taco) return position === undefined ? undefined : position === 0 ? flat : upright;
    return dp.MOTION === true ? upright : flat;
  }
  if (mode === 3 && position !== undefined) {
    return ([flat, 'partlyOpen', upright] as const)[position];
  }
  return undefined;
};
