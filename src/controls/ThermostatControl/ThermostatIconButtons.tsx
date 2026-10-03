import { ButtonHTMLAttributes } from 'react';
import MdiPowerStandby from '~icons/mdi/power-standby';
import MdiCalendarAuto from '~icons/mdi/thermostat-auto';
import MdiHandManual from '~icons/mdi/thermostat-cog';
import MdiFlame from '~icons/mdi/fire';
import { m } from '../../paraglide/messages';

interface ThermostatIconButtonsProps {
  manualMode: boolean;
  isRadiatorThermostat: boolean;
  boostMode: boolean;
  onPowerOff: () => void;
  onToggleMode: () => void;
  onToggleBoost: () => void;
}

const IconButton = ({ active, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) => (
  <button
    className={`bg-transparent border-none cursor-pointer p-2 flex items-center justify-center [transition:color_0.3s_ease,transform_0.2s_ease] rounded-full w-10 h-10 hover:bg-hover active:[transform:scale(0.95)] [&_svg]:w-6 [&_svg]:h-6 ${
      active ? 'text-[#03A9F4] hover:text-[#03A9F4]' : 'text-text-secondary hover:text-text'
    }`}
    {...props}
  />
);

export const ThermostatIconButtons: React.FC<ThermostatIconButtonsProps> = ({
  manualMode,
  isRadiatorThermostat,
  boostMode,
  onPowerOff,
  onToggleMode,
  onToggleBoost,
}) => {
  return (
    <div className="flex gap-2 -mt-12 mb-3 justify-center z-10">
      <IconButton onClick={onPowerOff} title={m.POWER_OFF()}>
        <MdiPowerStandby />
      </IconButton>
      <IconButton
        active={manualMode}
        onClick={onToggleMode}
        title={manualMode ? m.MANUAL() : m.AUTOMATIC()}
      >
        {manualMode ? <MdiHandManual /> : <MdiCalendarAuto />}
      </IconButton>
      {isRadiatorThermostat && (
        <IconButton
          active={boostMode}
          onClick={onToggleBoost}
          title={m.BOOST()}
        >
          <MdiFlame />
        </IconButton>
      )}
    </div>
  );
};