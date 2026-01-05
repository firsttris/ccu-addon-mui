import styled from '@emotion/styled';
import { MdiPowerStandby } from '../../components/icons/MdiPowerStandby';
import { MdiCalendarAuto } from '../../components/icons/MdiCalendarAuto';
import { MdiHandManual } from '../../components/icons/MdiHandManual';
import { MdiFlame } from '../../components/icons/MdiFlame';
import { useTranslations } from '../../i18n/utils';

interface ThermostatIconButtonsProps {
  manualMode: boolean;
  isRadiatorThermostat: boolean;
  boostMode: boolean;
  onPowerOff: () => void;
  onToggleMode: () => void;
  onToggleBoost: () => void;
}

const IconButtons = styled.div`
  display: flex;
  gap: 8px;
  margin-top: -48px;
  margin-bottom: 12px;
  justify-content: center;
  z-index: 10;
`;

const IconButton = styled.button<{ active?: boolean }>`
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${props => props.active ? '#03A9F4' : props.theme.colors.textSecondary};
  transition: color 0.3s ease, transform 0.2s ease;
  border-radius: 50%;
  width: 40px;
  height: 40px;

  &:hover {
    color: ${props => props.active ? '#03A9F4' : props.theme.colors.text};
    background: ${props => props.theme.colors.hover};
  }

  &:active {
    transform: scale(0.95);
  }

  svg {
    width: 24px;
    height: 24px;
  }
`;

export const ThermostatIconButtons: React.FC<ThermostatIconButtonsProps> = ({
  manualMode,
  isRadiatorThermostat,
  boostMode,
  onPowerOff,
  onToggleMode,
  onToggleBoost,
}) => {
  const t = useTranslations();

  return (
    <IconButtons>
      <IconButton onClick={onPowerOff} title={t('POWER_OFF')}>
        <MdiPowerStandby />
      </IconButton>
      <IconButton
        active={manualMode}
        onClick={onToggleMode}
        title={manualMode ? t('MANUAL') : t('AUTOMATIC')}
      >
        {manualMode ? <MdiHandManual /> : <MdiCalendarAuto />}
      </IconButton>
      {isRadiatorThermostat && (
        <IconButton
          active={boostMode}
          onClick={onToggleBoost}
          title={t('BOOST')}
        >
          <MdiFlame />
        </IconButton>
      )}
    </IconButtons>
  );
};