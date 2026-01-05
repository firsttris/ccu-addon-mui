import styled from '@emotion/styled';
import { MaterialSymbolsLightWindowOpen } from '../../components/icons/MaterialSymbolsLightWindowOpen';
import { MaterialSymbolsLightWindowClosed } from '../../components/icons/MaterialSymbolsLightWindowClosed';

interface TemperatureDisplayProps {
  localTarget: number;
  currentTemperature: number;
  humidity?: number;
  windowOpen: boolean;
}

const CenterContent = styled.div`
  position: absolute;
  top: 45%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  pointer-events: none;
  width: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
`;

const MainTemperature = styled.div`
  font-size: 72px;
  font-weight: 400;
  line-height: 1;
  color: var(--primary-text-color, #212121);
  letter-spacing: -3px;
`;

const TemperatureUnit = styled.span`
  font-size: 24px;
  font-weight: 300;
  margin-left: 2px;
  opacity: 0.5;
`;

const Separator = styled.div`
  width: 40px;
  height: 1px;
  background: var(--divider-color, #e0e0e0);
  margin: 4px auto;
`;

const StatsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  width: 100%;
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
`;

const StatValue = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: var(--primary-text-color, #212121);
`;

const StatLabel = styled.div`
  font-size: 10px;
  color: var(--secondary-text-color, #757575);
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

export const TemperatureDisplay: React.FC<TemperatureDisplayProps> = ({
  localTarget,
  currentTemperature,
  humidity,
  windowOpen,
}) => {
  return (
    <CenterContent>
      {windowOpen ? (
        <MaterialSymbolsLightWindowOpen fontSize={24} color="#80a7c4" style={{ marginBottom: '2px' }} />
      ) : (
        <MaterialSymbolsLightWindowClosed fontSize={24} color="#757575" style={{ marginBottom: '2px', opacity: 0.3 }} />
      )}
      <MainTemperature>
        {localTarget.toFixed(1)}
        <TemperatureUnit>°C</TemperatureUnit>
      </MainTemperature>

      <Separator />

      <StatsRow>
        <StatItem>
          <StatValue>{currentTemperature.toFixed(1)}°C</StatValue>
          <StatLabel>Aktuell</StatLabel>
        </StatItem>
        {humidity !== undefined && humidity > 0 && (
          <StatItem>
            <StatValue>{humidity}%</StatValue>
            <StatLabel>Luftfeuchte</StatLabel>
          </StatItem>
        )}
      </StatsRow>
    </CenterContent>
  );
};