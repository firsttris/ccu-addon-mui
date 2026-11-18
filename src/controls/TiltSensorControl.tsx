import VibrateIcon from '~icons/lucide/vibrate';
import RotateIcon from '~icons/lucide/rotate-3d';
import type { Channel, DatapointValue } from '../types/types';
import { useParamset } from '../queries';
import { m } from '../paraglide/messages';
import { DetectorTile } from './DetectorControls';
import { format, number } from './ClimateSensorControl';

const datapoints = (channel: Channel) => channel.datapoints as Record<string, DatapointValue>;

// --- Acceleration and tilt (HmIP-SAM, -STV, ELV-SH-CTV, -TACO …). What it
// reports depends on its operation mode (MASTER CHANNEL_OPERATION_MODE):
// 1 vibration, 2 position, 3 tilt. Shown as the WebUI's
// iseAccelerationTransceiver; devices with a STATE (three positions) as
// iseAccelerationTransceiverTaco (webui.js).

export const tiltReading = (
  dp: Record<string, DatapointValue>,
  mode: number | undefined,
): { label: string; value: string; active: boolean } | undefined => {
  const motion = dp.MOTION === true;
  const taco = dp.STATE !== undefined && dp.STATE !== null;
  const position = typeof dp.STATE === 'number' && dp.STATE >= 0 && dp.STATE <= 2 ? dp.STATE : undefined;
  const angle = number(dp.ABSOLUTE_ANGLE);
  switch (mode) {
    case 1:
      return { label: m.TILT_VIBRATION(), value: motion ? m.YES() : m.NO(), active: motion };
    case 2:
      if (taco) {
        const names = [m.TILT_HORIZONTAL, m.TILT_TILTED, m.TILT_TILTED];
        return {
          label: m.TILT_POSITION(),
          value: position !== undefined ? names[position]() : '–',
          active: (position ?? 0) > 0,
        };
      }
      return {
        label: m.TILT_POSITION(),
        value: motion ? m.TILT_NOT_HORIZONTAL() : m.TILT_HORIZONTAL(),
        active: motion,
      };
    case 3:
      if (taco) {
        const names = [m.TILT_HORIZONTAL, m.TILT_TILTED, m.TILT_VERTICAL];
        return {
          label: m.TILT_POSITION_A(),
          value: position !== undefined ? names[position]() : '–',
          active: (position ?? 0) > 0,
        };
      }
      return { label: m.TILT_ANGLE(), value: angle !== undefined ? `${format(angle, 0)}°` : '–', active: false };
  }
  return undefined;
};

export const TiltSensorControl = ({ channel }: { channel: Channel }) => {
  const dp = datapoints(channel);
  const { data: master } = useParamset(channel.interfaceName, channel.address, 'MASTER');
  const mode = typeof master?.CHANNEL_OPERATION_MODE === 'number' ? master.CHANNEL_OPERATION_MODE : undefined;
  const reading = tiltReading(dp, mode);
  const angle = number(dp.ABSOLUTE_ANGLE);
  // Devices with three positions show the angle too (iseAccelerationTransceiverTaco)
  const showAngle = angle !== undefined && dp.STATE !== undefined && dp.STATE !== null;
  return (
    <DetectorTile
      channel={channel}
      tone={reading?.active ? 'active' : 'calm'}
      waves={Boolean(reading?.active && mode === 1)}
      icon={mode === 1 ? <VibrateIcon /> : <RotateIcon />}
      status={
        reading
          ? `${reading.label}: ${reading.value}`
          : angle !== undefined
            ? `${m.TILT_ANGLE()}: ${format(angle, 0)}°`
            : m.INPUT_NO_FUNCTION()
      }
      detail={showAngle ? `${m.TILT_ANGLE()} ${format(angle, 0)}°` : undefined}
    />
  );
};
