import styled from '@emotion/styled';
import MdiMinus from '~icons/mdi/minus';
import MdiPlus from '~icons/mdi/plus';
import { ControlButton } from '../../components/ControlButton';
import { m } from '../../paraglide/messages';

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

export const ControlButtons: React.FC<ControlButtonsProps> = ({ onDecrease, onIncrease }) => {
  return (
    <Controls>
      <ControlButton onClick={onDecrease} title={m.DECREASE_TEMPERATURE()}>
        <MdiMinus />
      </ControlButton>

      <ControlButton onClick={onIncrease} title={m.INCREASE_TEMPERATURE()}>
        <MdiPlus />
      </ControlButton>
    </Controls>
  );
};