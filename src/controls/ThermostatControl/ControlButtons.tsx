import MinusIcon from '~icons/lucide/minus';
import PlusIcon from '~icons/lucide/plus';
import { m } from '../../paraglide/messages';

interface ControlButtonsProps {
  onDecrease: () => void;
  onIncrease: () => void;
}

const stepButton =
  'press flex h-12 items-center justify-center rounded-xl border bg-background/60 hover:bg-accent [&_svg]:size-5';

export const ControlButtons: React.FC<ControlButtonsProps> = ({ onDecrease, onIncrease }) => (
  <div className="grid w-full grid-cols-2 gap-2">
    <button className={stepButton} onClick={onDecrease} title={m.DECREASE_TEMPERATURE()} aria-label={m.DECREASE_TEMPERATURE()}>
      <MinusIcon />
    </button>
    <button className={stepButton} onClick={onIncrease} title={m.INCREASE_TEMPERATURE()} aria-label={m.INCREASE_TEMPERATURE()}>
      <PlusIcon />
    </button>
  </div>
);
