import { Channel, DatapointValue, HeatingClimateControlTransceiverChannel } from '../types/types';
import { useDevices, useParamset, useSetDataPoint } from '../queries';
import { Tile } from '../components/Tile';
import { useEffects, rgba } from '../contexts/EffectsContext';
import { getTemperatureColor } from '../utils/colors';
import { ThermostatDial } from './ThermostatControl/ThermostatDial';
import { TemperatureDisplay } from './ThermostatControl/TemperatureDisplay';
import { ControlButtons } from './ThermostatControl/ControlButtons';
import { ThermostatIconButtons } from './ThermostatControl/ThermostatIconButtons';
import { DeviceImage, useDeviceImage, useDeviceImages } from '../components/DeviceImage';
import { useThermostatState } from './ThermostatControl/hooks/useThermostatState';
import { temperatureRange } from './ThermostatControl/constants';
import { WeekProfileSheet } from './ThermostatControl/profile/WeekProfileSheet';
import { useState } from 'react';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';

type ThermostatProps = {
  channel: HeatingClimateControlTransceiverChannel | Channel;
};

const BOOST_COLOR = '#FF7043';
const OFF_TEMPERATURE = 4.5;

export const ThermostatControl: React.FC<ThermostatProps> = ({ channel }) => {
  const effects = useEffects();
  const datapoints = channel.datapoints as HeatingClimateControlTransceiverChannel['datapoints'] & Record<string, DatapointValue>;
  // BidCos thermostats (HM-CC-RT-DN, HM-TC-IT-WM) name things differently:
  // SET_TEMPERATURE, CONTROL_MODE 0 auto, 1 manual, 3 boost, VALVE_STATE
  // in percent, and actions AUTO_MODE, MANU_MODE, BOOST_MODE.
  const bidcos = typeof datapoints.SET_TEMPERATURE === 'number';
  const targetTemperature = Number(bidcos ? datapoints.SET_TEMPERATURE : datapoints.SET_POINT_TEMPERATURE);
  const currentTemperature = Number(datapoints.ACTUAL_TEMPERATURE);
  const humidity = (typeof datapoints.ACTUAL_HUMIDITY === 'number' ? datapoints.ACTUAL_HUMIDITY : datapoints.HUMIDITY) as number | undefined;
  const windowOpen = datapoints.WINDOW_STATE === 1;
  const isRadiatorThermostat = bidcos ? channel.type === 'CLIMATECONTROL_RT_TRANSCEIVER' : datapoints.VALVE_STATE !== undefined;
  const manualMode = bidcos ? datapoints.CONTROL_MODE === 1 : datapoints.SET_POINT_MODE === 1;
  const boostMode = bidcos ? datapoints.CONTROL_MODE === 3 : datapoints.BOOST_MODE === true;
  // Holiday mode until a set time (the WebUI's "Urlaubsmodus", its party dialog)
  // (webui.js iseThermostat_2ndGen: CONTROL_MODE 2; HmIP SET_POINT_MODE 2)
  const holidayMode = bidcos ? datapoints.CONTROL_MODE === 2 : datapoints.SET_POINT_MODE === 2;
  // The WebUI offers boost for every climate channel that has it
  // (heating_control.fn), wall thermostats too
  const canBoost = 'BOOST_MODE' in datapoints;
  // BidCos: comfort and lowering temperature at a touch, if the device has
  // both actions (heating_control.fn, HEATING_CONTROL.COMFORT/LOWERING)
  const canComfortLowering = bidcos && 'COMFORT_MODE' in datapoints && 'LOWERING_MODE' in datapoints;
  // Valve opening of a radiator thermostat in percent
  const valve = !isRadiatorThermostat
    ? undefined
    : bidcos
      ? typeof datapoints.VALVE_STATE === 'number'
        ? Math.round(datapoints.VALVE_STATE)
        : undefined
      : typeof datapoints.LEVEL === 'number'
        ? Math.round(datapoints.LEVEL * 100)
        : undefined;

  // The device's own limits, as the WebUI reads them (MASTER of the channel)
  const master = useParamset(channel.interfaceName, channel.address, 'MASTER', { enabled: !bidcos });
  const range = temperatureRange(bidcos ? undefined : master.data);

  const setDataPoint = useSetDataPoint();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const { localTarget, updateLocalTarget, commitTemperatureChange, decreaseTemperature, increaseTemperature } =
    useThermostatState({ targetTemperature, channel, datapoint: bidcos ? 'SET_TEMPERATURE' : 'SET_POINT_TEMPERATURE', range });

  const color = boostMode ? BOOST_COLOR : getTemperatureColor(localTarget);
  const currentColor = getTemperatureColor(currentTemperature);
  const demand = boostMode || localTarget > currentTemperature;

  const set = (datapoint: string, value: number | boolean) =>
    setDataPoint(channel.interfaceName, channel.address, datapoint, value);

  // Off: 4.5 °C, which the thermostats take as "off" (frost protection). For
  // HmIP in manual mode as the WebUI does (webui.js onClickModeOFF: SET_POINT_MODE
  // and CONTROL_MODE 1, SET_POINT_TEMPERATURE off: 4.5, or the device's
  // minimum if that is higher), else the next switching time of the week
  // profile turns the heating back on.
  const handlePowerOff = () => {
    if (bidcos) {
      set('SET_TEMPERATURE', OFF_TEMPERATURE);
      return;
    }
    set('CONTROL_MODE', 1);
    set('SET_POINT_TEMPERATURE', range.off);
  };

  const handleToggleMode = () => {
    if (!bidcos) set('CONTROL_MODE', manualMode ? 0 : 1);
    else if (manualMode) set('AUTO_MODE', true);
    else set('MANU_MODE', localTarget);
  };

  // BidCos can't end a boost directly: back to automatic
  const handleToggleBoost = () => (bidcos ? (boostMode ? set('AUTO_MODE', true) : set('BOOST_MODE', true)) : set('BOOST_MODE', !boostMode));

  const badge = boostMode
    ? { text: m.BOOST(), className: 'bg-orange-500/15 text-orange-700 dark:text-orange-300' }
    : windowOpen
      ? { text: m.WINDOW_OPEN(), className: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' }
      : holidayMode
        ? { text: m.HOLIDAY_MODE(), className: 'bg-violet-500/15 text-violet-700 dark:text-violet-300' }
        : // Below 5 °C the thermostat is off (webui.js: no mode shown then)
          targetTemperature < 5
          ? { text: m.OFF(), className: 'bg-muted text-muted-foreground' }
          : { text: manualMode ? m.MANUAL() : m.AUTO(), className: 'bg-muted text-muted-foreground' };

  const kind = isRadiatorThermostat
    ? [m.RADIATOR_THERMOSTAT(), valve !== undefined ? m.VALVE({ percent: valve }) : undefined].filter(Boolean).join(' · ')
    : m.WALL_THERMOSTAT();
  // The device's picture from the WebUI (DEVDB.tcl), a skeleton while the
  // device and picture lists load, nothing for a device without one
  const { data: devices, isPending: devicesLoading } = useDevices();
  const { isPending: imagesLoading } = useDeviceImages();
  const deviceType = devices?.find((d) => d.address === channel.address.split(':')[0])?.type;
  const loading = devicesLoading || imagesLoading;
  const hasImage = useDeviceImage(deviceType) !== undefined;

  return (
    <Tile
      status={channel.status}
      role="group"
      aria-label={channel.name}
      style={effects.on && demand ? { boxShadow: `0 24px 60px -28px ${rgba(color, 0.55 * effects.k)}` } : undefined}
    >
      <div className="flex flex-col items-center gap-1 px-3.5 pt-4 pb-3.5">
        <div className="flex w-full items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            {(loading || hasImage) && (
              <DeviceImage
                type={deviceType}
                size={40}
                fallback={loading ? <span className="size-full animate-pulse bg-muted-foreground/15" /> : null}
              />
            )}
            <div className="flex min-w-0 flex-col">
              <span className="line-clamp-2 text-[15px] leading-snug font-medium break-words" title={channel.name}>
                {channel.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">{kind}</span>
            </div>
          </div>
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium transition-colors', badge.className)}>
            {badge.text}
          </span>
        </div>

        <div className="relative aspect-square w-full max-w-[220px]">
          <ThermostatDial
            range={range}
            label={channel.name}
            currentTemperature={currentTemperature}
            localTarget={localTarget}
            color={color}
            currentColor={currentColor}
            demand={demand}
            onTemperatureChange={updateLocalTarget}
            onInteractionEnd={commitTemperatureChange}
          />
          <TemperatureDisplay
            localTarget={localTarget}
            currentTemperature={currentTemperature}
            humidity={humidity}
            windowOpen={windowOpen}
            color={color}
          />
          <ThermostatIconButtons
            manualMode={manualMode}
            canBoost={canBoost}
            boostMode={boostMode}
            onComfort={canComfortLowering ? () => set('COMFORT_MODE', true) : undefined}
            onLowering={canComfortLowering ? () => set('LOWERING_MODE', true) : undefined}
            onPowerOff={handlePowerOff}
            onToggleMode={handleToggleMode}
            onToggleBoost={handleToggleBoost}
          />
        </div>

        <ControlButtons
          onDecrease={decreaseTemperature}
          onIncrease={increaseTemperature}
          onSchedule={() => setScheduleOpen(true)}
        />
      </div>
      <WeekProfileSheet
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        interfaceName={channel.interfaceName}
        // BidCos thermostats keep it in the device's MASTER paramset
        address={bidcos ? channel.address.split(':')[0] : channel.address}
        name={channel.name}
        activeProfile={typeof datapoints.ACTIVE_PROFILE === 'number' ? datapoints.ACTIVE_PROFILE : undefined}
      />
    </Tile>
  );
};
