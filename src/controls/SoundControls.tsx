import { useRef } from 'react';
import MusicIcon from '~icons/lucide/music';
import BellIcon from '~icons/lucide/bell-ring';
import LightbulbIcon from '~icons/lucide/lightbulb';
import type { Channel, DatapointValue } from '../types/types';
import { useSetDataPoint } from '../queries';
import { Tile } from '../components/Tile';
import { Button } from '../components/ui/button';
import { NativeSelect } from '../components/ui/select';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';
import { LevelBar } from './light/LevelBar';

// Chimes and MP3 players, as the WebUI shows them

const Header = ({
  channel,
  icon,
  active,
  state,
}: {
  channel: Channel;
  icon: React.ReactNode;
  active: boolean;
  state: string;
}) => (
  <div className="flex items-center gap-3">
    <span
      aria-hidden
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full [&_svg]:size-5',
        active ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300' : 'bg-muted text-muted-foreground',
      )}
    >
      {icon}
    </span>
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-[15px] leading-snug font-medium" title={channel.name}>
        {channel.name}
      </span>
      <span className={cn('text-[13px]', active ? 'text-violet-700 dark:text-violet-300' : 'text-muted-foreground')}>
        {state}
      </span>
    </span>
  </div>
);

// SOUNDFILE: 0 is the internal system sound, 1..252 the files on the card
// (acoustic_signal.fn)
export const SOUND_FILES = 252;

// HmIP-MP3P (ACOUSTIC_SIGNAL_VIRTUAL_RECEIVER, acoustic_signal.fn): the
// level is the volume; on plays the chosen sound, off stops it
export const AcousticSignalControl = ({ channel }: { channel: Channel }) => {
  const setDataPoint = useSetDataPoint();
  const dp = channel.datapoints as Record<string, DatapointValue>;
  const level = Math.round(Number(dp.LEVEL ?? 0) * 100);
  const sound = Number(dp.SOUNDFILE ?? 0);
  const playing = level > 0;
  const lastLevel = useRef(level || 100);
  if (level > 0) lastLevel.current = level;
  const set = (datapoint: string, value: number) =>
    setDataPoint(channel.interfaceName, channel.address, datapoint, value);
  const soundName = (n: number) => (n === 0 ? m.SOUND_SYSTEM() : m.SOUND_FILE({ number: n }));
  return (
    <Tile status={channel.status}>
      <div className="flex flex-col gap-3 p-3.5">
        <Header
          channel={channel}
          icon={<MusicIcon />}
          active={playing}
          state={playing ? m.SOUND_PLAYING({ sound: soundName(sound), percent: level }) : m.OFF()}
        />
        <NativeSelect
          aria-label={m.SOUND_OF({ name: channel.name })}
          value={sound}
          onChange={(event) => set('SOUNDFILE', Number(event.target.value))}
        >
          {Array.from({ length: SOUND_FILES + 1 }, (_, n) => (
            <option key={n} value={n}>
              {soundName(n)}
            </option>
          ))}
        </NativeSelect>
        <LevelBar
          label={m.VOLUME_OF({ name: channel.name })}
          value={level}
          color={[167, 139, 250]}
          onChange={(v) => set('LEVEL', v / 100)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => set('LEVEL', lastLevel.current / 100)}>
            {m.SOUND_PLAY()}
          </Button>
          <Button variant="outline" disabled={!playing} onClick={() => set('LEVEL', 0)}>
            {m.SOUND_STOP()}
          </Button>
        </div>
      </div>
    </Tile>
  );
};

// HM-OU-CFM, -CF-Pl, -CM-PCB: chime (SIGNAL_CHIME) and flash light
// (SIGNAL_LED) switched with STATE; WORKING while it plays. Melodies and
// flash patterns are chosen in programs (setOUCFMMode.htm, SUBMIT).
export const SignalControl = ({ channel }: { channel: Channel }) => {
  const setDataPoint = useSetDataPoint();
  const dp = channel.datapoints as Record<string, DatapointValue>;
  const on = dp.STATE === true || dp.WORKING === true;
  const chime = channel.type === 'SIGNAL_CHIME';
  return (
    <Tile status={channel.status}>
      <div className="flex flex-col gap-3 p-3.5">
        <Header
          channel={channel}
          icon={chime ? <BellIcon /> : <LightbulbIcon />}
          active={on}
          state={on ? (chime ? m.CHIME_RINGING() : m.SIGNAL_FLASHING()) : m.OFF()}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => setDataPoint(channel.interfaceName, channel.address, 'STATE', true)}>
            {chime ? m.CHIME_RING() : m.SIGNAL_FLASH()}
          </Button>
          <Button
            variant="outline"
            disabled={!on}
            onClick={() => setDataPoint(channel.interfaceName, channel.address, 'STATE', false)}
          >
            {m.SOUND_STOP()}
          </Button>
        </div>
      </div>
    </Tile>
  );
};
