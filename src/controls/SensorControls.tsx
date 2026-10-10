import type { ReactNode } from 'react';
import CloudRainIcon from '~icons/lucide/cloud-rain';
import CloudIcon from '~icons/lucide/cloud';
import ThermometerIcon from '~icons/lucide/thermometer';
import DropletsIcon from '~icons/lucide/droplets';
import ArrowDownIcon from '~icons/lucide/arrow-down';
import ArrowUpIcon from '~icons/lucide/arrow-up';
import SigmaIcon from '~icons/lucide/sigma';
import RulerIcon from '~icons/lucide/ruler';
import WindIcon from '~icons/lucide/wind';
import PlugZapIcon from '~icons/lucide/plug-zap';
import UnplugIcon from '~icons/lucide/unplug';
import VibrateIcon from '~icons/lucide/vibrate';
import RotateIcon from '~icons/lucide/rotate-3d';
import type { Channel, DatapointValue } from '../types/types';
import { Tile } from '../components/Tile';
import { useParamset } from '../queries';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';
import { DetectorTile, type Tone } from './DetectorControls';
import { Extra, format, number } from './ClimateSensorControl';
import { useValueList } from './useValueList';

const datapoints = (channel: Channel) => channel.datapoints as Record<string, DatapointValue>;

// A measured value, unless its *_STATUS datapoint says it isn't valid
// (NORMAL is 0; UNKNOWN, OVERFLOW, UNDERFLOW … are not)
export const measured = (dp: Record<string, DatapointValue>, name: string) => {
  const status = dp[`${name}_STATUS`];
  if (status !== undefined && status !== null && status !== 0) return undefined;
  return number(dp[name]);
};

type Rating = 'good' | 'fair' | 'poor' | 'bad';

const ratingText: Record<Rating, string> = {
  good: 'text-green-700 dark:text-green-300',
  fair: 'text-lime-700 dark:text-lime-300',
  poor: 'text-amber-700 dark:text-amber-300',
  bad: 'text-red-600 dark:text-red-400',
};

// A measurement: the value large with its unit, how good it is, and more
// values below
export const MeasureTile = ({
  channel,
  value,
  unit,
  label,
  rating,
  ratingLabel,
  caption,
  extras = [],
}: {
  channel: Channel;
  value: string;
  unit: string;
  label: string;
  // What is measured, when the unit alone doesn't tell (PM2.5)
  caption?: string;
  rating?: Rating;
  ratingLabel?: string;
  extras?: ReactNode[];
}) => (
  <Tile status={channel.status} role="group" aria-label={channel.name}>
    <div className="flex flex-col gap-3 p-4">
      <span className="line-clamp-2 text-[15px] leading-snug font-medium" title={channel.name}>
        {channel.name}
      </span>
      {caption && <span className="-mb-2 text-xs font-medium text-muted-foreground">{caption}</span>}
      <div className="flex items-end justify-between gap-3">
        <span
          // A name only goes on an element with a role: read as one value with its unit
          role="img"
          className="text-[40px] leading-none font-semibold tracking-[-0.04em] tabular-nums"
          aria-label={`${label} ${value} ${unit}`}
        >
          {value}
          <span className="ml-1 text-lg font-medium text-muted-foreground">{unit}</span>
        </span>
        {rating && ratingLabel && (
          <span role="status" className={cn('pb-1 text-[13px] font-medium', ratingText[rating])}>
            {ratingLabel}
          </span>
        )}
      </div>
      {extras.length > 0 && <div className="grid grid-cols-2 gap-2">{extras}</div>}
    </div>
  </Tile>
);

// --- Rain (HmIP-SRD, as the WebUI's raindetector_transmitter.fn)

export const RainSensorControl = ({ channel }: { channel: Channel }) => {
  const dp = datapoints(channel);
  const raining = dp.RAINING === true;
  const unknown = typeof dp.RAINING !== 'boolean';
  const temperature = measured(dp, 'ACTUAL_TEMPERATURE');
  const heater = typeof dp.HEATER_STATE === 'boolean' ? dp.HEATER_STATE : undefined;
  const detail = [
    heater !== undefined ? `${m.RAIN_HEATER()} ${heater ? m.HEATER_ON() : m.HEATER_OFF()}` : undefined,
    temperature !== undefined ? `${format(temperature)} °C` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <DetectorTile
      channel={channel}
      tone={raining ? 'active' : 'calm'}
      waves={raining}
      icon={raining ? <CloudRainIcon /> : <CloudIcon />}
      status={unknown ? m.WINDOW_UNKNOWN() : raining ? m.IS_RAINING() : m.DRY()}
      detail={detail || undefined}
    />
  );
};

// --- Brightness (HmIP-SLO as brightness_transmitter.fn, HM-Sen-LI-O)

export const BrightnessControl = ({ channel }: { channel: Channel }) => {
  const dp = datapoints(channel);
  const current = measured(dp, 'CURRENT_ILLUMINATION') ?? number(dp.LUX);
  const lux = (v: number) => `${format(v, 0)} lx`;
  const extras: ReactNode[] = [];
  const average = measured(dp, 'AVERAGE_ILLUMINATION');
  const lowest = measured(dp, 'LOWEST_ILLUMINATION');
  const highest = measured(dp, 'HIGHEST_ILLUMINATION');
  if (average !== undefined)
    extras.push(<Extra key="avg" icon={<SigmaIcon />} label={m.ILLUMINATION_AVERAGE()} value={lux(average)} />);
  if (lowest !== undefined)
    extras.push(<Extra key="low" icon={<ArrowDownIcon />} label={m.ILLUMINATION_LOWEST()} value={lux(lowest)} />);
  if (highest !== undefined)
    extras.push(<Extra key="high" icon={<ArrowUpIcon />} label={m.ILLUMINATION_HIGHEST()} value={lux(highest)} />);
  return (
    <MeasureTile
      channel={channel}
      label={m.BRIGHTNESS()}
      value={current !== undefined ? format(current, 0) : '–'}
      unit="lx"
      extras={extras}
    />
  );
};

// --- CO₂ (HmIP-SCTH230). Rated as the German Environment Agency (UBA)
// rates indoor air: below 1000 ppm harmless, up to 2000 ppm conspicuous,
// above unacceptable.

export const co2Rating = (ppm: number): Rating => (ppm < 1000 ? 'good' : ppm <= 2000 ? 'poor' : 'bad');

const co2Label: Record<Rating, () => string> = {
  good: m.CO2_GOOD,
  fair: m.CO2_GOOD,
  poor: m.CO2_RAISED,
  bad: m.CO2_BAD,
};

export const Co2Control = ({ channel }: { channel: Channel }) => {
  const ppm = measured(datapoints(channel), 'CONCENTRATION');
  const rating = ppm !== undefined ? co2Rating(ppm) : undefined;
  return (
    <MeasureTile
      channel={channel}
      label={m.CO2()}
      value={ppm !== undefined ? format(ppm, 0) : '–'}
      unit="ppm"
      rating={rating}
      ratingLabel={rating ? co2Label[rating]() : undefined}
    />
  );
};

// BidCos HM-CC-SCD: only a level (rf_scd: LEVEL_NORMAL, LEVEL_ADDED,
// LEVEL_ADDED_STRONG)
const SCD_LEVELS = ['LEVEL_NORMAL', 'LEVEL_ADDED', 'LEVEL_ADDED_STRONG'];

export const Co2LevelControl = ({ channel }: { channel: Channel }) => {
  const { name } = useValueList(channel, 'STATE', SCD_LEVELS);
  const tone: Tone = name === 'LEVEL_ADDED_STRONG' ? 'alarm' : name === 'LEVEL_ADDED' ? 'active' : 'calm';
  const status =
    name === 'LEVEL_ADDED_STRONG'
      ? m.CO2_LEVEL_ADDED_STRONG()
      : name === 'LEVEL_ADDED'
        ? m.CO2_LEVEL_ADDED()
        : name === 'LEVEL_NORMAL'
          ? m.CO2_LEVEL_NORMAL()
          : m.WINDOW_UNKNOWN();
  return (
    <DetectorTile
      channel={channel}
      tone={tone}
      waves={tone !== 'calm'}
      icon={<WindIcon />}
      status={status}
      detail={m.CO2()}
    />
  );
};

// --- Particulate matter (HmIP-SFD), rated by PM2.5 with the European Air
// Quality Index of the EEA (µg/m³: 10 good, 20 fair, 25 moderate, 50 poor,
// 75 very poor, above extremely poor)

type PmRating = 'PM_GOOD' | 'PM_FAIR' | 'PM_MODERATE' | 'PM_POOR' | 'PM_VERY_POOR' | 'PM_EXTREMELY_POOR';

export const pmRating = (pm25: number): PmRating =>
  pm25 <= 10
    ? 'PM_GOOD'
    : pm25 <= 20
      ? 'PM_FAIR'
      : pm25 <= 25
        ? 'PM_MODERATE'
        : pm25 <= 50
          ? 'PM_POOR'
          : pm25 <= 75
            ? 'PM_VERY_POOR'
            : 'PM_EXTREMELY_POOR';

// Static references: a lookup m[key] would put every text into the bundle
const pmLabel: Record<PmRating, () => string> = {
  PM_GOOD: m.PM_GOOD,
  PM_FAIR: m.PM_FAIR,
  PM_MODERATE: m.PM_MODERATE,
  PM_POOR: m.PM_POOR,
  PM_VERY_POOR: m.PM_VERY_POOR,
  PM_EXTREMELY_POOR: m.PM_EXTREMELY_POOR,
};
const soilLabel = { SOIL_DRY: m.SOIL_DRY, SOIL_MOIST: m.SOIL_MOIST, SOIL_WET: m.SOIL_WET };

const pmTone: Record<PmRating, Rating> = {
  PM_GOOD: 'good',
  PM_FAIR: 'fair',
  PM_MODERATE: 'poor',
  PM_POOR: 'poor',
  PM_VERY_POOR: 'bad',
  PM_EXTREMELY_POOR: 'bad',
};

export const ParticulateMatterControl = ({ channel }: { channel: Channel }) => {
  const dp = datapoints(channel);
  const pm25 = measured(dp, 'MASS_CONCENTRATION_PM_2_5');
  const pm10 = measured(dp, 'MASS_CONCENTRATION_PM_10');
  const temperature = measured(dp, 'ACTUAL_TEMPERATURE');
  const humidity = measured(dp, 'HUMIDITY');
  const size = measured(dp, 'TYPICAL_PARTICLE_SIZE');
  const rating = pm25 !== undefined ? pmRating(pm25) : undefined;
  const extras: ReactNode[] = [];
  if (pm10 !== undefined)
    extras.push(<Extra key="pm10" icon={<WindIcon />} label="PM10" value={`${format(pm10)} µg/m³`} />);
  if (size !== undefined)
    extras.push(<Extra key="size" icon={<RulerIcon />} label={m.PARTICLE_SIZE()} value={`${format(size, 2)} µm`} />);
  if (temperature !== undefined)
    extras.push(
      <Extra key="t" icon={<ThermometerIcon />} label={m.TEMPERATURE()} value={`${format(temperature)} °C`} />,
    );
  if (humidity !== undefined)
    extras.push(<Extra key="h" icon={<DropletsIcon />} label={m.HUMIDITY()} value={`${format(humidity, 0)} %`} />);
  return (
    <MeasureTile
      channel={channel}
      label="PM2.5"
      value={pm25 !== undefined ? format(pm25) : '–'}
      unit="µg/m³"
      caption="PM2.5"
      rating={rating ? pmTone[rating] : undefined}
      ratingLabel={rating ? pmLabel[rating]() : undefined}
      extras={extras}
    />
  );
};

// --- Soil moisture (ELV-SH-SMSI)

export const soilRating = (percent: number): 'SOIL_DRY' | 'SOIL_MOIST' | 'SOIL_WET' =>
  percent < 30 ? 'SOIL_DRY' : percent > 70 ? 'SOIL_WET' : 'SOIL_MOIST';

export const SoilMoistureControl = ({ channel }: { channel: Channel }) => {
  const dp = datapoints(channel);
  const moisture = measured(dp, 'SOIL_MOISTURE');
  const temperature = measured(dp, 'SOIL_TEMPERATURE');
  const rating = moisture !== undefined ? soilRating(moisture) : undefined;
  const extras: ReactNode[] = [];
  if (temperature !== undefined)
    extras.push(
      <Extra key="t" icon={<ThermometerIcon />} label={m.SOIL_TEMPERATURE()} value={`${format(temperature)} °C`} />,
    );
  return (
    <MeasureTile
      channel={channel}
      label={m.SOIL_MOISTURE()}
      value={moisture !== undefined ? format(moisture, 0) : '–'}
      unit="%"
      rating={rating === 'SOIL_DRY' ? 'poor' : rating ? 'good' : undefined}
      ratingLabel={rating ? soilLabel[rating]() : undefined}
      extras={extras}
    />
  );
};

// --- Mains failure (HmIP-PMFS)

export const PowerMainsControl = ({ channel }: { channel: Channel }) => {
  const failure = datapoints(channel).POWER_MAINS_FAILURE;
  const unknown = typeof failure !== 'boolean';
  return (
    <DetectorTile
      channel={channel}
      tone={failure === true ? 'alarm' : 'calm'}
      waves={failure === true}
      icon={failure === true ? <UnplugIcon /> : <PlugZapIcon />}
      status={unknown ? m.WINDOW_UNKNOWN() : failure ? m.POWER_FAILURE() : m.POWER_OK()}
    />
  );
};

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
