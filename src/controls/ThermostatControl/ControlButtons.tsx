import MinusIcon from '~icons/lucide/minus';
import PlusIcon from '~icons/lucide/plus';
import CalendarDaysIcon from '~icons/lucide/calendar-days';
import { m } from '../../paraglide/messages';

interface ControlButtonsProps {
  onDecrease: () => void;
  onIncrease: () => void;
  onSchedule?: () => void;
}

const stepButton =
  'press flex h-12 items-center justify-center rounded-xl border bg-background/60 hover:bg-accent [&_svg]:size-5';

export const ControlButtons: React.FC<ControlButtonsProps> = ({ onDecrease, onIncrease, onSchedule }) => (
  <div className={`grid w-full gap-2 ${onSchedule ? 'grid-cols-[1fr_auto_1fr]' : 'grid-cols-2'}`}>
    <button
      type="button"
      className={stepButton}
      onClick={onDecrease}
      title={m.DECREASE_TEMPERATURE()}
      aria-label={m.DECREASE_TEMPERATURE()}
    >
      <MinusIcon />
    </button>
    {onSchedule && (
      <button
        type="button"
        className={`${stepButton} w-12`}
        onClick={onSchedule}
        title={m.WEEK_PROFILE()}
        aria-label={m.WEEK_PROFILE()}
      >
        <CalendarDaysIcon />
      </button>
    )}
    <button
      type="button"
      className={stepButton}
      onClick={onIncrease}
      title={m.INCREASE_TEMPERATURE()}
      aria-label={m.INCREASE_TEMPERATURE()}
    >
      <PlusIcon />
    </button>
  </div>
);
