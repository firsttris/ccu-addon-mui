import styled from '@emotion/styled';
import { HeatingClimateControlTransceiverChannel } from '../types/types';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { ChannelName } from '../components/ChannelName';
import { RadiatorThermostatIcon } from '../components/icons/RadiatorThermostatIcon';
import { WallThermostatIcon } from '../components/icons/WallThermostatIcon';
import { ThermostatDial } from './ThermostatControl/ThermostatDial';
import { TemperatureDisplay } from './ThermostatControl/TemperatureDisplay';
import { ControlButtons } from './ThermostatControl/ControlButtons';
import { ThermostatIconButtons } from './ThermostatControl/ThermostatIconButtons';
import { useThermostatState } from './ThermostatControl/hooks/useThermostatState';

type ThermostatProps = {
  channel: HeatingClimateControlTransceiverChannel;
};

const Container = styled.div`
  position: relative;
  width: 100%;
  max-width: 300px;
  padding: 16px 24px 16px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: ${props => props.theme.colors.surface};
  border-radius: 16px;

  @media (max-width: 400px) {
    max-width: 250px;
    padding: 12px 16px 12px 16px;
  }
`;

const Header = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 4px;
`;

const ThermostatWrapper = styled.div`
  position: relative;
  width: 100%;
  max-width: 260px;
  aspect-ratio: 1;
  margin: 0;
`;

export const ThermostatControl: React.FC<ThermostatProps> = ({ channel }) => {
  const datapoints = channel.datapoints;
  const targetTemperature = datapoints.SET_POINT_TEMPERATURE;
  const currentTemperature = datapoints.ACTUAL_TEMPERATURE;
  const humidity = datapoints.HUMIDITY;
  const windowOpen = datapoints.WINDOW_STATE === 1;
  const isRadiatorThermostat = datapoints.VALVE_STATE !== undefined;
  const manualMode = datapoints.SET_POINT_MODE === 1;
  const boostMode = datapoints.BOOST_MODE;

  const { setDataPoint } = useWebSocketContext();
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
    <Container>
      <Header>
        <ChannelName 
          name={channel.name} 
          maxWidth="220px"
          icon={isRadiatorThermostat ? <RadiatorThermostatIcon /> : <WallThermostatIcon />}
        />
      </Header>

      <ThermostatWrapper>
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
      </ThermostatWrapper>

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
    </Container>
  );
};
