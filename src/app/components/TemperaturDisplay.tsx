import styled from '@emotion/styled';

const Display = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #333;
`;

const Temperature = styled.div`
  font-size: 24px;
  font-weight: bold;
`;

const Group = styled.div`
    display: flex;
    font-size: 15px;
`;

const Container = styled.div`
    display: flex;
    justify-content: center;
    gap: 5px
    `;

interface TemperatureDisplayProps {
    targetTemperature: number;
    currentTemperature: number;
    humidity: number;
}

const TemperatureDisplay: React.FC<TemperatureDisplayProps> = ({ targetTemperature, currentTemperature, humidity }) => (
    <Display>
        <Temperature>{targetTemperature}°C</Temperature>
        <Container>
            <Group><div>🌡️</div> {currentTemperature}°C</Group>
            <Group><div>💧</div> {humidity}%</Group>
        </Container>
    </Display>
);

export default TemperatureDisplay;