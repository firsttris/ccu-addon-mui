import { HeatingClimateControlTransceiverChannel } from '../types/types';
import { useSetDataPoint } from '../queries';
import { ChannelName } from '../components/ChannelName';
import RadiatorThermostatIcon from '~icons/mui/radiator-thermostat';
import WallThermostatIcon from '~icons/mui/wall-thermostat';
import { ThermostatDial } from './ThermostatControl/ThermostatDial';
import { TemperatureDisplay } from './ThermostatControl/TemperatureDisplay';
import { ControlButtons } from './ThermostatControl/ControlButtons';
import { ThermostatIconButtons } from './ThermostatControl/ThermostatIconButtons';
import { useThermostatState } from './ThermostatControl/hooks/useThermostatState';

type ThermostatProps = {
  channel: HeatingClimateControlTransceiverChannel;
};

export const ThermostatControl: React.FC<ThermostatProps> = ({ channel }) => {
  const datapoints = channel.datapoints;
  const targetTemperature = datapoints.SET_POINT_TEMPERATURE;
  const currentTemperature = datapoints.ACTUAL_TEMPERATURE;
  const humidity = datapoints.HUMIDITY;
  const windowOpen = datapoints.WINDOW_STATE === 1;
  const isRadiatorThermostat = datapoints.VALVE_STATE !== undefined;
  const manualMode = datapoints.SET_POINT_MODE === 1;
  const boostMode = datapoints.BOOST_MODE;

  const setDataPoint = useSetDataPoint();
  const {
    localTarget,
    updateLocalTarget,
    commitTemperatureChange,
    decreaseTemperature,
    increaseTemperature,
  } = useThermostatState({ targetTemperature, channel });

  const handleTemperatureChange = (temp: number) => {
    updateLocalTarget(temp);
  };

  const handleInteractionEnd = (temp: number) => {
    commitTemperatureChange(temp);
  };

  const handlePowerOff = () => {
    setDataPoint(channel.interfaceName, channel.address, 'SET_POINT_TEMPERATURE', 5);
  };

  const handleToggleMode = () => {
    const newMode = manualMode ? 0 : 1;
    setDataPoint(channel.interfaceName, channel.address, 'CONTROL_MODE', newMode);
  };

  const handleToggleBoost = () => {
    setDataPoint(channel.interfaceName, channel.address, 'BOOST_MODE', !boostMode);
  };

  return (
    <div className="relative w-[250px] p-4 flex flex-col items-center bg-surface rounded-2xl max-[400px]:p-3">
      <div className="w-full flex justify-center items-center mb-1">
        <ChannelName 
          name={channel.name} 
          maxWidth="220px"
          icon={isRadiatorThermostat ? <RadiatorThermostatIcon /> : <WallThermostatIcon />}
        />
      </div>

      <div className="relative w-full max-w-[260px] aspect-square m-0">
        <ThermostatDial
          currentTemperature={currentTemperature}
          localTarget={localTarget}
          onTemperatureChange={handleTemperatureChange}
          onInteractionEnd={handleInteractionEnd}
        />

        <TemperatureDisplay
          localTarget={localTarget}
          currentTemperature={currentTemperature}
          humidity={humidity}
          windowOpen={windowOpen}
        />
      </div>

      <ThermostatIconButtons
        manualMode={manualMode}
        isRadiatorThermostat={isRadiatorThermostat}
        boostMode={boostMode}
        onPowerOff={handlePowerOff}
        onToggleMode={handleToggleMode}
        onToggleBoost={handleToggleBoost}
      />

      <ControlButtons
        onDecrease={decreaseTemperature}
        onIncrease={increaseTemperature}
      />
    </div>
  );
};
