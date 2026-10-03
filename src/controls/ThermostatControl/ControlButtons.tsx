import MdiMinus from '~icons/mdi/minus';
import MdiPlus from '~icons/mdi/plus';
import { ControlButton } from '../../components/ControlButton';
import { m } from '../../paraglide/messages';

interface ControlButtonsProps {
  onDecrease: () => void;
  onIncrease: () => void;
}

export const ControlButtons: React.FC<ControlButtonsProps> = ({ onDecrease, onIncrease }) => {
  return (
    <div className="flex justify-center items-center gap-4 -mt-3 w-full">
      <ControlButton onClick={onDecrease} title={m.DECREASE_TEMPERATURE()}>
        <MdiMinus />
      </ControlButton>

      <ControlButton onClick={onIncrease} title={m.INCREASE_TEMPERATURE()}>
        <MdiPlus />
      </ControlButton>
    </div>
  );
};