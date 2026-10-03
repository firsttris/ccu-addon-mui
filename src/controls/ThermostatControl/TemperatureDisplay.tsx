import { ReactNode } from 'react';
import MaterialSymbolsLightWindowOpen from '~icons/material-symbols-light/window-open';
import MaterialSymbolsLightWindowClosed from '~icons/mui/window-closed';
import { m } from '../../paraglide/messages';

interface TemperatureDisplayProps {
  localTarget: number;
  currentTemperature: number;
  humidity?: number;
  windowOpen: boolean;
}

const StatItem = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col items-center gap-[2px]">{children}</div>
);

const StatValue = ({ children }: { children: ReactNode }) => (
  <div className="text-[14px] font-medium text-text">{children}</div>
);

const StatLabel = ({ children }: { children: ReactNode }) => (
  <div className="text-[10px] text-text-secondary uppercase tracking-[0.5px]">{children}</div>
);

export const TemperatureDisplay: React.FC<TemperatureDisplayProps> = ({
  localTarget,
  currentTemperature,
  humidity,
  windowOpen,
}) => {
  return (
    <div className="absolute top-[45%] left-1/2 [transform:translate(-50%,-50%)] text-center pointer-events-none w-[180px] flex flex-col items-center justify-center gap-0">
      <div className={`text-text-secondary ${windowOpen ? 'animate-window-pulse' : ''}`}>
        {windowOpen ? (
          <MaterialSymbolsLightWindowOpen fontSize={24} color="#2196F3" />
        ) : (
          <MaterialSymbolsLightWindowClosed fontSize={24} style={{ opacity: 0.3 }} />
        )}
      </div>
      <div className="text-[72px] font-normal leading-none text-text tracking-[-3px]">
        {localTarget.toFixed(1)}
        <span className="text-[24px] font-light ml-[2px] opacity-50 align-super">°C</span>
      </div>

      <div className="w-10 h-px bg-border my-1 mx-auto" />

      <div className="flex items-center justify-center gap-5 w-full mt-1">
        <StatItem>
          <StatValue>{currentTemperature.toFixed(1)}°C</StatValue>
          <StatLabel>{m.CURRENT_TEMPERATURE()}</StatLabel>
        </StatItem>
        {humidity !== undefined && humidity > 0 && (
          <StatItem>
            <StatValue>{humidity}%</StatValue>
            <StatLabel>{m.HUMIDITY()}</StatLabel>
          </StatItem>
        )}
      </div>
    </div>
  );
};