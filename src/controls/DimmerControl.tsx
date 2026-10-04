import { useRef } from 'react';
import { Channel, DatapointValue } from '../types/types';
import { useSetDataPoint } from '../queries';
import { Tile } from '../components/Tile';
import { useEffects } from '../contexts/EffectsContext';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';
import { useStateChanges } from './SwitchControl';
import { litTileStyle, PendantLamp, RGB, WARM } from './light/PendantLamp';
import { LevelBar } from './light/LevelBar';

// Backlight colors of HmIP-BSL switches (COLOR datapoint)
const BSL_COLORS: { name: string; rgb: RGB }[] = [
  { name: 'BLACK', rgb: [63, 63, 70] },
  { name: 'BLUE', rgb: [59, 130, 246] },
  { name: 'GREEN', rgb: [34, 197, 94] },
  { name: 'TURQUOISE', rgb: [20, 184, 166] },
  { name: 'RED', rgb: [239, 68, 68] },
  { name: 'PURPLE', rgb: [168, 85, 247] },
  { name: 'YELLOW', rgb: [250, 204, 21] },
  { name: 'WHITE', rgb: [244, 244, 245] },
];

// What a status LED does (COLOR_BEHAVIOUR), in the order of the WebUI's
// opticalsignalreceiver.fn
const BEHAVIOURS = [
  () => m.BEHAVIOUR_OFF(),
  () => m.BEHAVIOUR_ON(),
  () => m.BEHAVIOUR_BLINK_SLOW(),
  () => m.BEHAVIOUR_BLINK_MIDDLE(),
  () => m.BEHAVIOUR_BLINK_FAST(),
  () => m.BEHAVIOUR_FLASH_SLOW(),
  () => m.BEHAVIOUR_FLASH_MIDDLE(),
  () => m.BEHAVIOUR_FLASH_FAST(),
  () => m.BEHAVIOUR_BILLOW_SLOW(),
  () => m.BEHAVIOUR_BILLOW_MIDDLE(),
  () => m.BEHAVIOUR_BILLOW_FAST(),
];

export const dimLevel = (channel: Channel) => {
  const level = Number((channel.datapoints as Record<string, DatapointValue>).LEVEL ?? 0);
  // Above 1 are special values, not a state
  return Number.isFinite(level) ? Math.round(Math.min(1, Math.max(0, level)) * 100) : 0;
};

// Dimmers (HmIP DIMMER_VIRTUAL_RECEIVER, BidCos DIMMER and its
// VIRTUAL_DIMMER channels), backlights (BACKLIGHTING_RECEIVER) and status
// LEDs (OPTICAL_SIGNAL_RECEIVER), which the WebUI all shows with
// dimmer.fn: a tap switches on at the last brightness or off, the bar sets
// it. The lamp's light follows the level; LEDs have a color and a
// behaviour (opticalsignalreceiver.fn).
export const DimmerControl = ({ channel }: { channel: Channel }) => {
  const setDataPoint = useSetDataPoint();
  const effects = useEffects();
  const dp = channel.datapoints as Record<string, DatapointValue>;
  const level = dimLevel(channel);
  const on = level > 0;
  const { changes, external, markRequested } = useStateChanges(on);
  const colorIndex = typeof dp.COLOR === 'number' ? dp.COLOR : undefined;
  const color = colorIndex !== undefined && colorIndex > 0 ? (BSL_COLORS[colorIndex]?.rgb ?? WARM) : WARM;
  const set = (datapoint: string, value: number | boolean) =>
    setDataPoint(channel.interfaceName, channel.address, datapoint, value);

  // Switched on again at the brightness it had last (as far as this tile
  // saw it), else fully
  const lastLevel = useRef(level || 100);
  if (level > 0) lastLevel.current = level;
  const toggle = () => {
    markRequested(!on);
    set('LEVEL', on ? 0 : lastLevel.current / 100);
  };

  const state = on ? m.DIMMED_TO({ percent: level }) : m.OFF();
  return (
    <Tile
      status={channel.status}
      lit={on}
      className={cn(effects.on && external && 'fx-flash')}
      style={litTileStyle(level / 100, color, effects.on, effects.k)}
    >
      <button
        onClick={toggle}
        aria-pressed={on}
        aria-label={`${channel.name}: ${state}`}
        className="press relative flex h-[132px] flex-col items-start justify-end overflow-hidden px-3.5 pb-2 text-left"
      >
        <PendantLamp level={level / 100} color={color} changes={changes} />
        <span className="relative flex w-full min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 text-[15px] leading-snug font-medium" title={channel.name}>
            {channel.name}
          </span>
          <span className={cn('text-[13px]', on ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
            {external ? m.AT_DEVICE({ state }) : state}
          </span>
        </span>
      </button>
      <div className="flex flex-col gap-2 px-3.5 pb-3.5">
        <LevelBar
          label={m.BRIGHTNESS_OF({ name: channel.name })}
          value={level}
          color={color}
          onChange={(v) => set('LEVEL', v / 100)}
        />
        {typeof dp.COLOR_BEHAVIOUR === 'number' && (
          <label className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
            {m.LED_BEHAVIOUR()}
            <select
              aria-label={`${m.LED_BEHAVIOUR()}: ${channel.name}`}
              className="h-8 rounded-md border bg-background px-2 text-[13px] text-foreground"
              value={dp.COLOR_BEHAVIOUR}
              onChange={(e) => set('COLOR_BEHAVIOUR', Number(e.target.value))}
            >
              {BEHAVIOURS.map((label, i) => (
                <option key={i} value={i}>
                  {label()}
                </option>
              ))}
            </select>
          </label>
        )}
        {colorIndex !== undefined && (
          <div className="grid grid-cols-8 gap-1" role="radiogroup" aria-label={m.BACKLIGHT_COLOR()}>
            {BSL_COLORS.map((c, i) => (
              <button
                key={c.name}
                type="button"
                role="radio"
                aria-checked={colorIndex === i}
                aria-label={c.name}
                title={c.name}
                onClick={() => set('COLOR', i)}
                className={cn(
                  'press aspect-square w-full max-w-5 justify-self-center rounded-full border border-black/10 ring-offset-1 ring-offset-card dark:border-white/15',
                  colorIndex === i && 'ring-2 ring-foreground/70',
                )}
                style={{ background: `rgb(${c.rgb.join(',')})` }}
              />
            ))}
          </div>
        )}
      </div>
    </Tile>
  );
};
