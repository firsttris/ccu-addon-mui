import { ReactNode } from 'react';
import RulerIcon from '~icons/lucide/ruler';
import ArrowUpIcon from '~icons/lucide/arrow-up-to-line';
import ArrowLeftRightIcon from '~icons/lucide/arrow-left-right';
import ArrowRightIcon from '~icons/lucide/arrow-right';
import ArrowLeftIcon from '~icons/lucide/arrow-left';
import CylinderIcon from '~icons/lucide/cylinder';
import SigmaIcon from '~icons/lucide/sigma';
import { Channel, DatapointValue } from '../types/types';
import { useParamset, useParamsetDescription } from '../queries';
import { m } from '../paraglide/messages';
import { DetectorTile } from './DetectorControls';
import { Extra, format, number } from './ClimateSensorControl';
import { MeasureTile, measured } from './SensorControls';

// Sensors that measure or count: the distance sensor ELV-SH-DUSI, the
// passage detector HmIP-SPDR, the capacitive filling level sensor
// HM-Sen-Wa-Od and the meter sensor HM-ES-TX-WM with an IEC or gas sensor.

const datapoints = (channel: Channel) => channel.datapoints as Record<string, DatapointValue>;
const channelIndex = (channel: Channel) => Number(channel.address.split(':')[1] ?? 0);

// The unit the device states for a value, else a fallback
const useUnits = (channel: Channel) => {
  const { data } = useParamsetDescription(channel.interfaceName, channel.address);
  return (name: string, fallback: string) => data?.[name]?.unit || fallback;
};

// --- Distance (DISTANCE_TRANSMITTER), as the WebUI's distance_transmitter.fn:
// the distance, the height (reference height minus distance) and the
// reference height, each with one decimal and the unit of the device
export const DistanceControl = ({ channel }: { channel: Channel }) => {
  const dp = datapoints(channel);
  const unit = useUnits(channel);
  const distance = measured(dp, 'DISTANCE');
  const reference = number(dp.REFERENCE_HEIGHT);
  const height = distance !== undefined && reference !== undefined ? reference - distance : undefined;
  const extras: ReactNode[] = [];
  if (height !== undefined)
    extras.push(
      <Extra
        key="height"
        icon={<ArrowUpIcon />}
        label={m.DISTANCE_HEIGHT()}
        value={`${format(height)} ${unit('HEIGHT', 'm')}`}
      />,
    );
  if (reference !== undefined)
    extras.push(
      <Extra
        key="reference"
        icon={<RulerIcon />}
        label={m.DISTANCE_REFERENCE()}
        value={`${format(reference)} ${unit('REFERENCE_HEIGHT', 'm')}`}
      />,
    );
  return (
    <MeasureTile
      channel={channel}
      label={m.DISTANCE()}
      caption={m.DISTANCE()}
      value={distance !== undefined ? format(distance) : '–'}
      unit={unit('DISTANCE', 'm')}
      extras={extras}
    />
  );
};

// --- Passage detector HmIP-SPDR, as passagedetector.fn: channel 2 counts
// from right to left, channel 3 from left to right; the detected and the
// last passage are the direction whose channel reports it, the counters
// and their overflow are shown for both
export const passageDirection = (rightToLeft: boolean, leftToRight: boolean) =>
  leftToRight ? m.PASSAGE_LEFT_TO_RIGHT() : rightToLeft ? m.PASSAGE_RIGHT_TO_LEFT() : m.PASSAGE_UNKNOWN();

export const PassageDetectorControl = ({ channels }: { channels: Channel[] }) => {
  const sorted = [...channels].sort((a, b) => channelIndex(a) - channelIndex(b));
  const rl = datapoints(sorted.find((c) => channelIndex(c) === 2) ?? sorted[0]);
  const lr = datapoints(sorted.find((c) => channelIndex(c) === 3) ?? sorted[sorted.length - 1]);
  const current = rl.CURRENT_PASSAGE_DIRECTION === true || lr.CURRENT_PASSAGE_DIRECTION === true;
  const count = (dp: Record<string, DatapointValue>) => {
    const value = number(dp.PASSAGE_COUNTER_VALUE);
    if (value === undefined) return '–';
    return dp.PASSAGE_COUNTER_OVERFLOW === true ? `${value} (${m.PASSAGE_OVERFLOW()})` : String(value);
  };
  return (
    <DetectorTile
      channel={sorted[0]}
      tone={current ? 'active' : 'calm'}
      waves={current}
      icon={<ArrowLeftRightIcon />}
      status={`${m.PASSAGE_DETECTED()}: ${passageDirection(rl.CURRENT_PASSAGE_DIRECTION === true, lr.CURRENT_PASSAGE_DIRECTION === true)}`}
      detail={`${m.PASSAGE_LAST()}: ${passageDirection(rl.LAST_PASSAGE_DIRECTION === true, lr.LAST_PASSAGE_DIRECTION === true)}`}
    >
      <div className="grid grid-cols-2 gap-2">
        <Extra icon={<ArrowRightIcon />} label={m.PASSAGE_COUNT_LEFT_TO_RIGHT()} value={count(lr)} />
        <Extra icon={<ArrowLeftIcon />} label={m.PASSAGE_COUNT_RIGHT_TO_LEFT()} value={count(rl)} />
      </div>
    </DetectorTile>
  );
};

// --- Capacitive filling level sensor HM-Sen-Wa-Od, as
// capacitive_filling_level_sensor.fn: the level in percent and the volume
// it means in the tank set up in the device settings (CASE_DESIGN 0
// vertical barrel, 1 horizontal barrel, 2 rectangle; sizes in cm)
export const tankVolume = (master: Record<string, DatapointValue> | undefined, level: number) => {
  const design = number(master?.CASE_DESIGN);
  const height = number(master?.CASE_HIGH);
  const width = number(master?.CASE_WIDTH);
  if (design === undefined || height === undefined || width === undefined) return undefined;
  const share = level / 100;
  let volume: number | undefined;
  switch (design) {
    case 0: {
      const radius = width / 2;
      volume = Math.PI * radius ** 2 * height * share;
      break;
    }
    case 1: {
      // FILL_LEVEL: the height the tank is filled to at 100 %
      const fill = number(master?.FILL_LEVEL);
      if (fill === undefined) return undefined;
      const radius = height / 2;
      const full =
        radius ** 2 *
        width *
        (Math.acos((radius - fill) / radius) -
          ((radius - fill) * Math.sqrt(2 * radius * fill - fill ** 2)) / radius ** 2);
      volume = full * share;
      break;
    }
    case 2: {
      const length = number(master?.CASE_LENGTH);
      if (length === undefined) return undefined;
      volume = height * share * width * length;
      break;
    }
  }
  return volume !== undefined && Number.isFinite(volume) ? Math.round(volume / 1000) : undefined;
};

export const FillingLevelControl = ({ channel }: { channel: Channel }) => {
  const dp = datapoints(channel);
  const unit = useUnits(channel);
  const level = number(dp.FILLING_LEVEL);
  const { data: master } = useParamset(channel.interfaceName, channel.address, 'MASTER');
  const volume = level !== undefined ? tankVolume(master, level) : undefined;
  const extras: ReactNode[] = [];
  if (volume !== undefined)
    extras.push(<Extra key="volume" icon={<CylinderIcon />} label={m.FILLING_VOLUME()} value={`${volume} l`} />);
  return (
    <MeasureTile
      channel={channel}
      label={m.FILLING_LEVEL()}
      caption={m.FILLING_LEVEL()}
      value={level !== undefined ? format(level, 0) : '–'}
      unit={unit('FILLING_LEVEL', '%')}
      extras={extras}
    />
  );
};

// --- Meter sensor HM-ES-TX-WM (POWERMETER_IGL, POWERMETER_IEC1/2), as
// powermeter.fn and webui.js isePowerMeter: the sensor attached
// (MASTER METER_TYPE) decides which values count. Without METER_TYPE,
// POWERMETER is electricity, the others IEC (getSensorType).
export type MeterSensor = 'gas' | 'electricity' | 'iec' | 'unknown';

export const meterSensor = (channelType: string, meterType: DatapointValue | undefined): MeterSensor => {
  if (typeof meterType !== 'number') return channelType === 'POWERMETER' ? 'electricity' : 'iec';
  const types: MeterSensor[] = channelType.startsWith('POWERMETER_IEC')
    ? ['gas', 'electricity', 'electricity', 'iec', 'unknown']
    : ['gas', 'electricity', 'electricity', 'unknown'];
  return types[meterType] ?? 'unknown';
};

// The datapoints per sensor (opts.val<Panel><Extension>)
const meterDatapoints: Record<MeterSensor, { counter: string; power: string }> = {
  electricity: { counter: 'ENERGY_COUNTER', power: 'POWER' },
  unknown: { counter: 'ENERGY_COUNTER', power: 'POWER' },
  gas: { counter: 'GAS_ENERGY_COUNTER', power: 'GAS_POWER' },
  iec: { counter: 'IEC_ENERGY_COUNTER', power: 'IEC_POWER' },
};

export const MeterSensorControl = ({ channel }: { channel: Channel }) => {
  const dp = datapoints(channel);
  const unit = useUnits(channel);
  const { data: master } = useParamset(channel.interfaceName, channel.address, 'MASTER');
  const sensor = meterSensor(channel.type, master?.METER_TYPE);
  // Channel 2 only counts with an IEC sensor (channelNotActiv)
  if (channel.type === 'POWERMETER_IEC2' && sensor !== 'iec')
    return (
      <DetectorTile channel={channel} tone="calm" waves={false} icon={<SigmaIcon />} status={m.INPUT_NO_FUNCTION()} />
    );
  const names = meterDatapoints[sensor];
  const power = number(dp[names.power]);
  const counter = number(dp[names.counter]);
  // An unknown sensor has no unit (isePowerMeter: unitEnergyCounter = "")
  const counterUnit = sensor === 'unknown' ? '' : unit(names.counter, sensor === 'gas' ? 'm³' : 'Wh');
  const powerUnit = sensor === 'unknown' ? '' : unit(names.power, sensor === 'gas' ? 'm³' : 'W');
  // Wh read better in kWh (changeToKilo)
  const counterText =
    counter === undefined
      ? '–'
      : counterUnit === 'Wh'
        ? `${format(counter / 1000, 3)} kWh`
        : `${format(counter, 2)} ${counterUnit}`.trim();
  const label = sensor === 'gas' ? m.METER_CONSUMPTION() : m.METER_POWER();
  return (
    <MeasureTile
      channel={channel}
      label={label}
      caption={sensor === 'gas' ? `${m.GAS()} · ${label}` : label}
      value={power !== undefined ? format(power, 2) : '–'}
      unit={powerUnit}
      extras={[
        // Meter readings run long: the whole width
        <div key="counter" className="col-span-2">
          <Extra icon={<SigmaIcon />} label={m.METER_READING()} value={counterText} />
        </div>,
      ]}
    />
  );
};
