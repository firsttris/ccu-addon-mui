import { ButtonHTMLAttributes, ReactNode, useState } from 'react';
import { KeymaticChannel } from '../types/types';
import { Button } from '../components/Button';
import { useSetDataPoint } from '../queries';
import MaterialSymbolsDoorOpenOutline from '~icons/material-symbols/door-open-outline';
import MaterialSymbolsLockOutline from '~icons/material-symbols/lock-outline';
import MaterialSymbolsLockOpenOutline from '~icons/material-symbols/lock-open-outline';
import { m } from '../paraglide/messages';

const TextButton = ({ primary, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) => (
  <button
    className={`text-[15px] font-semibold py-2 px-4 rounded-lg cursor-pointer border border-solid border-border ${
      primary ? 'text-white bg-[#c62828]' : 'text-text bg-primary'
    }`}
    {...props}
  />
);

const ButtonWrapper = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col items-center gap-1">{children}</div>
);

const ButtonLabel = ({ children }: { children: ReactNode }) => (
  <span className="text-[12px] text-text-secondary text-center">{children}</span>
);

interface DoorControlProps {
  channel: KeymaticChannel;
}

export const DoorControl: React.FC<DoorControlProps> = ({ channel }) => {
  const setDataPoint = useSetDataPoint();
  const {
    datapoints: { STATE, STATE_UNCERTAIN },
    name,
  } = channel;

  const isUncertain = STATE_UNCERTAIN === true;
  const isUnlocked = STATE === true;

  // Unlocking and opening ask first, so a stray tap (e.g. while wiping the
  // kitchen tablet) can't open the front door. Locking needs no confirmation.
  const [confirming, setConfirming] = useState<'unlock' | 'open' | null>(null);

  const unlockDoor = () => {
    setDataPoint(channel.interfaceName, channel.address, 'STATE', true);
  };

  const lockDoor = () => {
    setDataPoint(channel.interfaceName, channel.address, 'STATE', false);
  };

  const openDoor = () => {
    setDataPoint(channel.interfaceName, channel.address, 'OPEN', true);
  };

  return (
    <div className="border border-solid border-border rounded-lg p-4 shadow-[0_2px_4px_rgba(0,0,0,0.1)] flex flex-col items-center w-[200px] bg-surface transition-shadow duration-200 ease-[ease] hover:shadow-[0_4px_8px_rgba(0,0,0,0.15)]">
      <h3 className="mt-0 mx-0 mb-3 text-[16px] font-medium text-text text-center">{name}</h3>
      {confirming ? (
        <div className="flex flex-col items-center gap-[10px] min-h-[72px]">
          <span className="text-[15px] font-semibold text-text">{confirming === 'open' ? m.CONFIRM_OPEN() : m.CONFIRM_UNLOCK()}</span>
          <div className="flex gap-[10px]">
            <TextButton onClick={() => setConfirming(null)}>{m.CANCEL()}</TextButton>
            <TextButton
              primary
              onClick={() => {
                if (confirming === 'open') {
                  openDoor();
                } else {
                  unlockDoor();
                }
                setConfirming(null);
              }}
            >
              {m.YES()}
            </TextButton>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 items-center">
          <ButtonWrapper>
            <Button onClick={lockDoor}>
              <MaterialSymbolsLockOutline />
            </Button>
            <ButtonLabel>{m.LOCK()}</ButtonLabel>
          </ButtonWrapper>
          <ButtonWrapper>
            <Button onClick={() => setConfirming('unlock')}>
              <MaterialSymbolsLockOpenOutline />
            </Button>
            <ButtonLabel>{m.UNLOCK()}</ButtonLabel>
          </ButtonWrapper>
          <ButtonWrapper>
            <Button onClick={() => setConfirming('open')}>
              <MaterialSymbolsDoorOpenOutline />
            </Button>
            <ButtonLabel>{m.OPEN()}</ButtonLabel>
          </ButtonWrapper>
        </div>
      )}
      <span className="mt-3 text-[14px] text-text-secondary text-center">
        {isUncertain ? '' : (isUnlocked ? m.UNLOCKED() : m.LOCKED())}
      </span>
      <span className={`${isUncertain ? 'block' : 'hidden'} mt-3 text-[14px] text-text-secondary text-center`}>
        {m.DOOR_STATE_UNKNOWN()}
      </span>
    </div>
  );
};
