import styled from '@emotion/styled';
import { TemperatureDisplay } from '../components/TemperaturDisplay';
import { HeatingClimateControlTransceiverChannel } from 'src/types/types';
import { Icon } from '@iconify/react';
import { useWebSocketContext } from './../../hooks/useWebsocket';

type ThermostatProps = {
  channel: HeatingClimateControlTransceiverChannel
};

const Container = styled.div`
  width: 250px;
  height: 100%;
  padding: 20px;
`;

const Title = styled.div`
  font-size: 18px;
  font-weight: bold;
  height: 40px;
  text-align: center;
`;

const getColor = (temperature: number) => {
  if (temperature < 10) return '#00BFFF'; // DeepSkyBlue
  if (temperature < 15) return '#8A2BE2'; // BlueViolet
  if (temperature < 25) return '#32CD32'; // LimeGreen
  return '#FF8C00'; // DarkOrange
};

const Dial = styled.div<{ temperature: number }>`
    width: 70%;
    height: 0;
    padding-bottom: 70%;
    margin: 20px auto;
    position: relative;
    border-radius: 50%;
    background: #f0f0f0; 
  
    &::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: conic-gradient(
        from 180deg,
        ${props => getColor(props.temperature)} ${props => (props.temperature / 30) * 360}deg,
        #d3d3d3 ${props => (props.temperature / 30) * 360}deg
      );
      -webkit-mask: 
        radial-gradient(farthest-side, transparent calc(100% - 10px), black calc(100% - 10px));
      mask: 
        radial-gradient(farthest-side, transparent calc(100% - 10px), black calc(100% - 10px));
    }
  `;

export const Button = styled.button`
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: 1px solid #ccc;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 25px;

  &:hover {
    background: #f0f0f0;
  }
`;

const Controls = styled.div`
  display: flex;
  justify-content: space-between;
  margin-top: -50px;
`;

export const ThermostatControl: React.FC<ThermostatProps> = ({ channel }) => {
  const datapoints = channel.datapoints;
  const targetTemperature = datapoints.SET_POINT_TEMPERATURE;
  const currentTemperature = datapoints.ACTUAL_TEMPERATURE;
  const humidity = datapoints.HUMIDITY;

  const { setDataPoint } = useWebSocketContext();

  const decreaseTemperature = () => setDataPoint(channel.interfaceName, channel.address, 'SET_POINT_TEMPERATURE', targetTemperature - 0.5);
  const increaseTemperature = () => setDataPoint(channel.interfaceName, channel.address, 'SET_POINT_TEMPERATURE', targetTemperature + 0.5);
  const boostMode = () => setDataPoint(channel.interfaceName, channel.address, 'BOOST_MODE', true);

  return (
    <Container>
      <Title>{channel.name}</Title>
      <Dial temperature={targetTemperature}>
        <TemperatureDisplay
          targetTemperature={targetTemperature}
          currentTemperature={currentTemperature}
          humidity={humidity}
          activateBoost={boostMode}
          windowOpen={datapoints.WINDOW_STATE === 1}
        />
      </Dial>
      <Controls>
        <Button onClick={decreaseTemperature}>
        <Icon icon="mdi:minus" />
        </Button>
        <Button onClick={increaseTemperature}>
        <Icon icon="mdi:plus" />
        </Button>
      </Controls>
    </Container>
  );
};