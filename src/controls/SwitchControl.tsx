import { useEffect, useRef, useState } from 'react';
import { SwitchVirtualReceiverChannel } from '../types/types';
import { useSetDataPoint } from '../queries';
import { Tile } from '../components/Tile';
import { useEffects } from '../contexts/EffectsContext';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';
import { litTileStyle, PendantLamp, WARM } from './light/PendantLamp';

interface ControlProps {
  channel: SwitchVirtualReceiverChannel;
}

// Counts how often the state changed, to restart the swing each time, and
// whether the last change came from elsewhere (the wall switch, a program):
// anything but the state this tile just asked for.
export const useStateChanges = <T,>(on: T) => {
  const [changes, setChanges] = useState(0);
  const [external, setExternal] = useState(false);
  const previous = useRef(on);
  const requested = useRef<{ state: T; at: number } | null>(null);
  useEffect(() => {
    if (previous.current === on) return;
    previous.current = on;
    setChanges((c) => c + 1);
    const own = requested.current && requested.current.state === on && Date.now() - requested.current.at < 3000;
    requested.current = null;
    if (!own) {
      setExternal(true);
      const timer = setTimeout(() => setExternal(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [on]);
  return { changes, external, markRequested: (state: T) => (requested.current = { state, at: Date.now() }) };
};

// A switch actuator as a pendant lamp: switched on, it casts a cone of
// warm light into the tile and swings briefly.
export const SwitchControl = ({ channel }: ControlProps) => {
  const setDataPoint = useSetDataPoint();
  const effects = useEffects();
  const { datapoints, name, address, interfaceName } = channel;
  const on = datapoints.STATE === true;
  const { changes, external, markRequested } = useStateChanges(on);
  const state = on ? m.ON() : m.OFF();

  const toggle = () => {
    markRequested(!on);
    setDataPoint(interfaceName, address, 'STATE', !on);
  };

  return (
    <Tile
      status={channel.status}
      lit={on}
      className={cn('h-40', effects.on && external && 'fx-flash')}
      style={litTileStyle(on ? 1 : 0, WARM, effects.on, effects.k)}
    >
      <button
        onClick={toggle}
        aria-pressed={on}
        aria-label={`${name}: ${state}`}
        className="press relative flex flex-1 flex-col items-start justify-end overflow-hidden px-3.5 pb-3 text-left"
      >
        <PendantLamp level={on ? 1 : 0} changes={changes} />
        <span className="relative flex w-full min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 text-[15px] leading-snug font-medium" title={name}>
            {name}
          </span>
          <span className={cn('text-[13px]', on ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
            {external ? m.AT_DEVICE({ state }) : state}
          </span>
        </span>
      </button>
    </Tile>
  );
};
