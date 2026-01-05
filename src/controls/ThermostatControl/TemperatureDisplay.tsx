import styled from '@emotion/styled';
import { keyframes, css } from '@emotion/react';
import { MaterialSymbolsLightWindowOpen } from '../../components/icons/MaterialSymbolsLightWindowOpen';
import { MaterialSymbolsLightWindowClosed } from '../../components/icons/MaterialSymbolsLightWindowClosed';
import { useTranslations } from '../../i18n/utils';

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
  gap: 0px;
`;

const MainTemperature = styled.div`
  font-size: 72px;
  font-weight: 400;
  line-height: 1;
  color: ${props => props.theme.colors.text};
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
  background: ${props => props.theme.colors.border};
  margin: 4px auto;
`;

const StatsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  width: 100%;
  margin-top: 4px;
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
  color: ${props => props.theme.colors.text};
`;

const StatLabel = styled.div`
  font-size: 10px;
  color: ${props => props.theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const pulse = keyframes`
  0% {
    transform: scale(1);
    opacity: 1;
    filter: drop-shadow(0 0 0 rgba(33, 150, 243, 0));
  }
  50% {
    transform: scale(1.05);
    opacity: 0.9;
    filter: drop-shadow(0 0 4px rgba(33, 150, 243, 0.4));
  }
  100% {
    transform: scale(1);
    opacity: 1;
    filter: drop-shadow(0 0 0 rgba(33, 150, 243, 0));
  }
`;

const WindowIconWrapper = styled.div<{ windowOpen: boolean }>`
  animation: ${({ windowOpen }) => windowOpen ? css`${pulse} 2s infinite` : 'none'};
  color: ${props => props.theme.colors.textSecondary};
`;

export const TemperatureDisplay: React.FC<TemperatureDisplayProps> = ({
  localTarget,
  currentTemperature,
  humidity,
  windowOpen,
}) => {
  const t = useTranslations();

  return (
    <CenterContent>
      <WindowIconWrapper windowOpen={windowOpen}>
        {windowOpen ? (
          <MaterialSymbolsLightWindowOpen fontSize={24} color="#2196F3" />
        ) : (
          <MaterialSymbolsLightWindowClosed fontSize={24} style={{ opacity: 0.3 }} />
        )}
      </WindowIconWrapper>
      <MainTemperature>
        {localTarget.toFixed(1)}
        <TemperatureUnit>°C</TemperatureUnit>
      </MainTemperature>

      <Separator />

      <StatsRow>
        <StatItem>
          <StatValue>{currentTemperature.toFixed(1)}°C</StatValue>
          <StatLabel>{t('CURRENT_TEMPERATURE')}</StatLabel>
        </StatItem>
        {humidity !== undefined && humidity > 0 && (
          <StatItem>
            <StatValue>{humidity}%</StatValue>
            <StatLabel>{t('HUMIDITY')}</StatLabel>
          </StatItem>
        )}
      </StatsRow>
    </CenterContent>
  );
};