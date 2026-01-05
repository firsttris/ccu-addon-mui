import styled from '@emotion/styled';
import { CurrentTemperature } from '../components/TemperaturDisplay';
import { HeatingClimateControlTransceiverChannel } from 'src/types/types';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { Button } from '../components/Button';
import { MdiMinus } from '../components/icons/MdiMinus';
import { MdiPlus } from '../components/icons/MdiPlus';
import { ChannelName } from '../components/ChannelName';
import { MaterialSymbolsLightWindowOpen } from '../components/icons/MaterialSymbolsLightWindowOpen';

type ThermostatProps = {
  channel: HeatingClimateControlTransceiverChannel;
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

const Dial = styled.div<{ temperature: number; targetTemperature: number }>`
  width: 70%;
  height: 0;
  padding-bottom: 70%;
  margin: 0 auto;
  margin-bottom: 10px;
  position: relative;
  border-radius: 50%;
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
      ${(props) => getColor(props.temperature)}
        ${(props) => (props.temperature / 40) * 280}deg,
      #d3d3d3 ${(props) => (props.temperature / 40) * 280}deg 280deg,
      transparent 280deg 360deg
    );
    -webkit-mask: radial-gradient(
      farthest-side,
      transparent calc(100% - 10px),
      black calc(100% - 10px)
    );
    mask: radial-gradient(
      farthest-side,
      transparent calc(100% - 10px),
      black calc(100% - 10px)
    );
  }

  &::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 100%;
    height: 100%;
    pointer-events: none;
    border-radius: 50%;
    background: conic-gradient(
      from 220deg,
      transparent 0deg ${(props) => (props.targetTemperature / 40) * 280}deg,
      red ${(props) => (props.targetTemperature / 40) * 280}deg
        ${(props) => (props.targetTemperature / 40) * 280 + 2}deg,
      transparent ${(props) => (props.targetTemperature / 40) * 280 + 2}deg
        360deg
    );
    -webkit-mask: radial-gradient(
      farthest-side,
      transparent calc(100% - 10px),
      black calc(100% - 10px)
    );
    mask: radial-gradient(
      farthest-side,
      transparent calc(100% - 10px),
      black calc(100% - 10px)
    );
  }
`;

const Controls = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: -50px;
`;

export const ThermostatControl: React.FC<ThermostatProps> = ({ channel }) => {
  const datapoints = channel.datapoints;
  const targetTemperature = datapoints.SET_POINT_TEMPERATURE;
  const currentTemperature = datapoints.ACTUAL_TEMPERATURE;
  const humidity = datapoints.HUMIDITY;

  const { setDataPoint } = useWebSocketContext();

  const decreaseTemperature = () =>
    setDataPoint(
      channel.interfaceName,
      channel.address,
      'SET_POINT_TEMPERATURE',
      targetTemperature - 0.5,
    );
  const increaseTemperature = () =>
    setDataPoint(
      channel.interfaceName,
      channel.address,
      'SET_POINT_TEMPERATURE',
      targetTemperature + 0.5,
    );
  // const boostMode = () => setDataPoint(channel.interfaceName, channel.address, 'BOOST_MODE', true);

  return (
    <Container>
      <ChannelName name={channel.name} maxWidth="250px" />
      <Dial
        temperature={currentTemperature}
        targetTemperature={targetTemperature}
      >
        <CurrentTemperature currentTemperature={currentTemperature} />
      </Dial>
      <Controls>
        <Button onClick={decreaseTemperature}>
          <MdiMinus />
        </Button>
        <div
          style={{
            position: 'relative',
            display: 'inline-block',
            border: '1px solid lightgrey',
            borderRadius: '5px',
            padding: '5px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span style={{ fontSize: '25px', fontWeight: 'bold' }}>
              {targetTemperature.toFixed(1)}
            </span>
            <span style={{ fontSize: '12px', marginLeft: '4px' }}>°C</span>
          </div>
        </div>
        <Button onClick={increaseTemperature}>
          <MdiPlus />
        </Button>
      </Controls>
      <div>
        {humidity ? (
          <div
            style={{
              position: 'absolute',
              bottom: 165,
              left: 110,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span
              role="img"
              aria-label="humidity"
              style={{
                fontSize: '15px',
              }}
            >
              💧
            </span>
            <div style={{ color: '#00BFFF' }}>{humidity}%</div>
          </div>
        ) : null}
        <div style={{ marginTop: 4, position: 'absolute', top: 2, right: 10 }}>
          {datapoints.WINDOW_STATE === 1 ? (
            <MaterialSymbolsLightWindowOpen fontSize={23} color="#00BFFF" />
          ) : null}
        </div>
      </div>
    </Container>
  );
};
