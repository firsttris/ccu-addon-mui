import styled from '@emotion/styled';
import { MdiPowerStandby } from '../../components/icons/MdiPowerStandby';
import { MdiCalendarAuto } from '../../components/icons/MdiCalendarAuto';
import { MdiHandManual } from '../../components/icons/MdiHandManual';
import { MdiFlame } from '../../components/icons/MdiFlame';

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
  color: ${props => props.active ? 'var(--primary-color, #03A9F4)' : 'var(--disabled-text-color, #bdbdbd)'};
  transition: color 0.3s ease, transform 0.2s ease;
  border-radius: 50%;
  width: 40px;
  height: 40px;

  &:hover {
    color: ${props => props.active ? 'var(--primary-color, #03A9F4)' : 'var(--secondary-text-color, #757575)'};
    background: rgba(0, 0, 0, 0.05);
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
  return (
    <IconButtons>
      <IconButton onClick={onPowerOff} title="Ausschalten">
        <MdiPowerStandby />
      </IconButton>
      <IconButton
        active={manualMode}
        onClick={onToggleMode}
        title={manualMode ? "Manuell" : "Automatisch"}
      >
        {manualMode ? <MdiHandManual /> : <MdiCalendarAuto />}
      </IconButton>
      {isRadiatorThermostat && (
        <IconButton
          active={boostMode}
          onClick={onToggleBoost}
          title="Boost"
        >
          <MdiFlame />
        </IconButton>
      )}
    </IconButtons>
  );
};