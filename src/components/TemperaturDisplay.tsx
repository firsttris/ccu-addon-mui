import styled from '@emotion/styled';
import { MaterialSymbolsLightWindowOpen } from './icons/MaterialSymbolsLightWindowOpen';

const Display = styled.div({
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  textAlign: 'center',
  color: '#333',
});

const Temperature = styled.div({
  fontSize: '24px',
  fontWeight: 'bold',
});

const Group = styled.div({
  display: 'flex',
  fontSize: '18px',
  flexDirection: 'row',
  alignItems: 'center',
});

const Container = styled.div({
  display: 'flex',
  justifyContent: 'center',
  gap: '3px',
});

export const Button = styled.button`
  border-radius: 50%;
  border: none;
  background: #ff4500;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  padding: 5px;

  &:hover {
    background: #ff6347;
  }
`;

interface TemperatureDisplayProps {
  targetTemperature: number;
  currentTemperature: number;
  humidity?: number;
  activateBoost: () => void;
  windowOpen: boolean;
}

export const TemperatureDisplay: React.FC<TemperatureDisplayProps> = ({
  targetTemperature,
  currentTemperature,
  humidity,
  activateBoost,
  windowOpen,
}) => (
  <Display>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '5px',
        marginBottom: '-5px',
      }}
    >
      <Temperature>{targetTemperature}°C</Temperature>
      {windowOpen ? (
        <MaterialSymbolsLightWindowOpen 
          fontSize={23}
          color="#00BFFF" />
      ) : null}
    </div>
    <Container>
      <Group>
        <span
          role="img"
          aria-label="temp"
          style={{
            fontSize: '25px',
            marginRight: '-8px',
            marginBottom: '10px',
          }}
        >
          🌡️
        </span>
        <div>{currentTemperature}°C</div>
      </Group>
      {humidity ? (
        <Group>
          <span
            role="img"
            aria-label="humidity"
            style={{
              fontSize: '20px',
              marginRight: '-2px',
              marginBottom: '5px',
            }}
          >
            💧
          </span>
          <div>{humidity}%</div>
        </Group>
      ) : null}
    </Container>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexDirection: 'column',
        marginTop: '5px',
      }}
    >
      {/*
                <Button onClick={() => activateBoost()}>
                    <Icon icon="mdi:fire" fontSize={30} />
                </Button>
                */}
    </div>
  </Display>
);
