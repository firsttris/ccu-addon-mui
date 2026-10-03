import { HeatingClimateControlTransceiverChannel } from '../types/types';
import { useSetDataPoint } from '../queries';
import RadiatorThermostatIcon from '~icons/mui/radiator-thermostat';
import WallThermostatIcon from '~icons/mui/wall-thermostat';
import { Tile } from '../components/Tile';
import { useEffects, rgba } from '../contexts/EffectsContext';
import { getTemperatureColor } from '../utils/colors';
import { ThermostatDial } from './ThermostatControl/ThermostatDial';
import { TemperatureDisplay } from './ThermostatControl/TemperatureDisplay';
import { ControlButtons } from './ThermostatControl/ControlButtons';
import { ThermostatIconButtons } from './ThermostatControl/ThermostatIconButtons';
import { useThermostatState } from './ThermostatControl/hooks/useThermostatState';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';

type ThermostatProps = {
  channel: HeatingClimateControlTransceiverChannel;
};

const BOOST_COLOR = '#FF7043';

export const ThermostatControl: React.FC<ThermostatProps> = ({ channel }) => {
  const effects = useEffects();
  const datapoints = channel.datapoints;
  const targetTemperature = datapoints.SET_POINT_TEMPERATURE;
  const currentTemperature = datapoints.ACTUAL_TEMPERATURE;
  const humidity = datapoints.HUMIDITY;
  const windowOpen = datapoints.WINDOW_STATE === 1;
  const isRadiatorThermostat = datapoints.VALVE_STATE !== undefined;
  const manualMode = datapoints.SET_POINT_MODE === 1;
  const boostMode = datapoints.BOOST_MODE;
  // Valve opening of a radiator thermostat, 0..1
  const valve = isRadiatorThermostat && typeof datapoints.LEVEL === 'number' ? Math.round(datapoints.LEVEL * 100) : undefined;

  const setDataPoint = useSetDataPoint();
  const { localTarget, updateLocalTarget, commitTemperatureChange, decreaseTemperature, increaseTemperature } =
    useThermostatState({ targetTemperature, channel });

  const color = boostMode ? BOOST_COLOR : getTemperatureColor(localTarget);
  const currentColor = getTemperatureColor(currentTemperature);
  const demand = boostMode || localTarget > currentTemperature;

  const handlePowerOff = () => {
    setDataPoint(channel.interfaceName, channel.address, 'SET_POINT_TEMPERATURE', 5);
  };

  const handleToggleMode = () => {
    setDataPoint(channel.interfaceName, channel.address, 'CONTROL_MODE', manualMode ? 0 : 1);
  };

  const handleToggleBoost = () => {
    setDataPoint(channel.interfaceName, channel.address, 'BOOST_MODE', !boostMode);
  };

  const badge = boostMode
    ? { text: m.BOOST(), className: 'bg-orange-500/15 text-orange-700 dark:text-orange-300' }
    : windowOpen
      ? { text: m.WINDOW_OPEN(), className: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' }
      : { text: manualMode ? m.MANUAL() : m.AUTO(), className: 'bg-muted text-muted-foreground' };

  const kind = isRadiatorThermostat
    ? [m.RADIATOR_THERMOSTAT(), valve !== undefined ? m.VALVE({ percent: valve }) : undefined].filter(Boolean).join(' · ')
    : m.WALL_THERMOSTAT();

  return (
    <Tile
      status={channel.status}
      style={effects.on && demand ? { boxShadow: `0 24px 60px -28px ${rgba(color, 0.55 * effects.k)}` } : undefined}
    >
      <div className="flex flex-col items-center gap-1 px-3.5 pt-4 pb-3.5">
        <div className="flex w-full items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:size-[18px]">
              {isRadiatorThermostat ? <RadiatorThermostatIcon /> : <WallThermostatIcon />}
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="line-clamp-2 text-[15px] leading-snug font-medium wrap-anywhere" title={channel.name}>
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
            isRadiatorThermostat={isRadiatorThermostat}
            boostMode={boostMode}
            onPowerOff={handlePowerOff}
            onToggleMode={handleToggleMode}
            onToggleBoost={handleToggleBoost}
          />
        </div>

        <ControlButtons onDecrease={decreaseTemperature} onIncrease={increaseTemperature} />
      </div>
    </Tile>
  );
};
