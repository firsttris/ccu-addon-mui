import PowerIcon from '~icons/lucide/power';
import CalendarIcon from '~icons/lucide/calendar-clock';
import HandIcon from '~icons/lucide/hand';
import FlameIcon from '~icons/lucide/flame';
import { useEffects } from '../../contexts/EffectsContext';
import { m } from '../../paraglide/messages';
import { cn } from '../../lib/utils';

interface ThermostatIconButtonsProps {
  manualMode: boolean;
  isRadiatorThermostat: boolean;
  boostMode: boolean;
  onPowerOff: () => void;
  onToggleMode: () => void;
  onToggleBoost: () => void;
}

const iconButton =
  'press flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-5';

export const ThermostatIconButtons: React.FC<ThermostatIconButtonsProps> = ({
  manualMode,
  isRadiatorThermostat,
  boostMode,
  onPowerOff,
  onToggleMode,
  onToggleBoost,
}) => {
  const effects = useEffects();
  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1">
      <button className={iconButton} onClick={onPowerOff} title={m.POWER_OFF()} aria-label={m.POWER_OFF()}>
        <PowerIcon />
      </button>
      <button
        className={cn(iconButton, manualMode && 'bg-sky-500/15 text-sky-600 hover:text-sky-600 dark:text-sky-300')}
        onClick={onToggleMode}
        title={manualMode ? m.SWITCH_MANUAL() : m.SWITCH_AUTO()}
        aria-label={manualMode ? m.MANUAL() : m.AUTOMATIC()}
      >
        {manualMode ? <HandIcon /> : <CalendarIcon />}
      </button>
      {isRadiatorThermostat && (
        <button
          className={cn(iconButton, boostMode && 'bg-orange-500/15 text-orange-600 hover:text-orange-600 dark:text-orange-300')}
          onClick={onToggleBoost}
          title={m.BOOST()}
          aria-label={m.BOOST()}
          aria-pressed={boostMode}
          style={
            boostMode && effects.on
              ? { boxShadow: `0 0 ${16 * effects.k}px rgba(255,112,67,${Math.min(1, 0.45 * effects.k)})` }
              : undefined
          }
        >
          <FlameIcon />
        </button>
      )}
    </div>
  );
};
