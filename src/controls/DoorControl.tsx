import { useState } from 'react';
import { KeymaticChannel } from '../types/types';
import { useSetDataPoint } from '../queries';
import LockIcon from '~icons/lucide/lock';
import LockOpenIcon from '~icons/lucide/lock-open';
import DoorOpenIcon from '~icons/lucide/door-open';
import { Tile } from '../components/Tile';
import { Button } from '../components/ui/button';
import { useEffects } from '../contexts/EffectsContext';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';

interface DoorControlProps {
  channel: KeymaticChannel;
}

const actionButton =
  'press flex h-16 flex-col items-center justify-center gap-1 rounded-xl border bg-background/60 text-xs text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-5';

export const DoorControl: React.FC<DoorControlProps> = ({ channel }) => {
  const setDataPoint = useSetDataPoint();
  const effects = useEffects();
  const {
    datapoints: { STATE, STATE_UNCERTAIN },
    name,
  } = channel;

  const isUncertain = STATE_UNCERTAIN === true;
  const isUnlocked = STATE === true;

  // Unlocking and opening ask first, so a stray tap (e.g. while wiping the
  // kitchen tablet) can't open the front door. Locking needs no confirmation.
  const [confirming, setConfirming] = useState<'unlock' | 'open' | null>(null);

  const set = (datapoint: 'STATE' | 'OPEN', value: boolean) =>
    setDataPoint(channel.interfaceName, channel.address, datapoint, value);

  return (
    <Tile status={channel.status}>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5',
              isUncertain
                ? 'bg-muted text-muted-foreground'
                : isUnlocked
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                  : 'bg-green-500/15 text-green-700 dark:text-green-300',
            )}
            style={
              effects.on && !isUncertain
                ? { boxShadow: `0 0 ${16 * effects.k}px ${isUnlocked ? 'rgba(251,191,36,0.3)' : 'rgba(34,197,94,0.25)'}` }
                : undefined
            }
          >
            {isUnlocked ? <LockOpenIcon /> : <LockIcon />}
          </div>
          <div className="flex min-w-0 flex-col">
            <h3 className="truncate text-[15px] font-medium">{name}</h3>
            <span className="text-[13px] text-muted-foreground">
              {isUncertain ? m.DOOR_STATE_UNKNOWN() : isUnlocked ? m.UNLOCKED() : m.LOCKED()}
            </span>
          </div>
        </div>
        {confirming ? (
          <div className="flex min-h-16 flex-col gap-2 rounded-xl bg-destructive/10 p-3">
            <span className="text-sm font-medium">{confirming === 'open' ? m.CONFIRM_OPEN() : m.CONFIRM_UNLOCK()}</span>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setConfirming(null)}>
                {m.CANCEL()}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (confirming === 'open') {
                    set('OPEN', true);
                  } else {
                    set('STATE', true);
                  }
                  setConfirming(null);
                }}
              >
                {m.YES()}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <button className={actionButton} onClick={() => set('STATE', false)}>
              <LockIcon />
              {m.LOCK()}
            </button>
            <button className={actionButton} onClick={() => setConfirming('unlock')}>
              <LockOpenIcon />
              {m.UNLOCK()}
            </button>
            <button className={actionButton} onClick={() => setConfirming('open')}>
              <DoorOpenIcon />
              {m.OPEN()}
            </button>
          </div>
        )}
      </div>
    </Tile>
  );
};
