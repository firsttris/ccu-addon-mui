import styled from '@emotion/styled';
import { MdiMinus } from '../../components/icons/MdiMinus';
import { MdiPlus } from '../../components/icons/MdiPlus';

interface ControlButtonsProps {
  onDecrease: () => void;
  onIncrease: () => void;
}

const Controls = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: -12px;
  width: 100%;
`;

const ControlButton = styled.button`
  background: transparent;
  border: 2px solid var(--divider-color, #e0e0e0);
  border-radius: 50%;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--primary-text-color, #212121);
  transition: all 0.2s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
    border-color: var(--primary-color, #03A9F4);
  }

  &:active {
    transform: scale(0.95);
  }

  svg {
    width: 24px;
    height: 24px;
  }
`;

export const ControlButtons: React.FC<ControlButtonsProps> = ({ onDecrease, onIncrease }) => {
  return (
    <Controls>
      <ControlButton onClick={onDecrease} title="Temperatur verringern">
        <MdiMinus />
      </ControlButton>

      <ControlButton onClick={onIncrease} title="Temperatur erhöhen">
        <MdiPlus />
      </ControlButton>
    </Controls>
  );
};