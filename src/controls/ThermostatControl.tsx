import styled from '@emotion/styled';
import { TemperatureDisplay } from '../components/TemperaturDisplay';
import { HeatingClimateControlTransceiverChannel } from 'src/types/types';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { Button } from '../components/Button';
import { MdiMinus } from '../components/icons/MdiMinus';
import { MdiPlus } from '../components/icons/MdiPlus';
import { ChannelName } from '../components/ChannelName';

type ThermostatProps = {
  channel: HeatingClimateControlTransceiverChannel
};

const Container = styled.div`
  position: relative;
  width: 250px;
  height: 100%;
  padding: 10px;
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
    margin: 0 auto;
    margin-bottom: 10px;
    position: relative;
    border-radius: 50%;
    //background: #f0f0f0; 
  
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
        from 220deg,
        ${props => getColor(props.temperature)} ${props => (props.temperature / 40) * 280}deg, /* 90% of 360 degrees */
        #d3d3d3 ${props => (props.temperature / 40) * 280}deg 280deg, /* 90% of 360 degrees */
        transparent 280deg 360deg /* 10% transparent */
      );
      -webkit-mask: 
        radial-gradient(farthest-side, transparent calc(100% - 10px), black calc(100% - 10px));
      mask: 
        radial-gradient(farthest-side, transparent calc(100% - 10px), black calc(100% - 10px));
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
      <ChannelName name={channel.name} maxWidth='250px' />
      <Dial temperature={currentTemperature}>
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
          <MdiMinus />
        </Button>
        <Button onClick={increaseTemperature}>
          <MdiPlus />
        </Button>
      </Controls>
    </Container>
  );
};