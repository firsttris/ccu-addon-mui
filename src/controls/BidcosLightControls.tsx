import type { Channel, DatapointValue } from '../types/types';
import { useSetDataPoint } from '../queries';
import { Tile } from '../components/Tile';
import { NativeSelect } from '../components/ui/select';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';
import { HueBar, hsvToRgb } from './ColorLightControl';
import { LevelBar } from './light/LevelBar';
import type { RGB } from './light/PendantLamp';

// The color and white channels of the BidCos LED controllers, as the
// WebUI's rgbw.fn and dual_white_controller.fn show them. Their brightness
// is a DIMMER or DUAL_WHITE_BRIGHTNESS channel with the dimmer tile.

// RGBW_COLOR.COLOR: 0..199 runs through the hues, 200 is white (rgbw.fn
// converts hue / 360 * 199)
export const RGBW_WHITE = 200;
export const colorToHue = (color: number) => Math.round((Math.min(color, 199) / 199) * 360);
export const hueToColor = (hue: number) => Math.round(((((hue % 360) + 360) % 360) / 360) * 199);

const QUICK_HUES = [0, 30, 55, 120, 200, 275];
const WHITE: RGB = [250, 248, 240];

const Header = ({ channel, color, state }: { channel: Channel; color: RGB; state: string }) => (
  <div className="flex items-center gap-3 px-3.5 pt-3.5">
    <span
      aria-hidden
      className="size-9 shrink-0 rounded-full border border-black/10 shadow-inner dark:border-white/15"
      style={{ background: `rgb(${color.join(',')})` }}
    />
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-[15px] leading-snug font-medium" title={channel.name}>
        {channel.name}
      </span>
      <span className="text-[13px] text-muted-foreground">{state}</span>
    </span>
  </div>
);

// HM-LC-RGBW-WM channel 2: the color of the LEDs
export const RgbwColorControl = ({ channel }: { channel: Channel }) => {
  const setDataPoint = useSetDataPoint();
  const dp = channel.datapoints as Record<string, DatapointValue>;
  const value = Number(dp.COLOR ?? 0);
  const white = value >= RGBW_WHITE;
  const hue = colorToHue(value);
  const color = white ? WHITE : hsvToRgb(hue, 1);
  const set = (next: number) => setDataPoint(channel.interfaceName, channel.address, 'COLOR', next);
  const swatch = 'press size-6 rounded-full border border-black/10 ring-offset-2 ring-offset-card dark:border-white/15';
  return (
    <Tile status={channel.status} className="col-span-2">
      <Header channel={channel} color={color} state={white ? m.RGBW_WHITE() : `${m.COLOR()} ${hue}°`} />
      <div className="flex flex-col gap-3 px-3.5 pt-3 pb-3.5">
        <HueBar label={m.COLOR_OF({ name: channel.name })} hue={hue} onChange={(h) => set(hueToColor(h))} />
        <div className="flex flex-wrap justify-between gap-1.5" role="group" aria-label={m.QUICK_COLORS()}>
          <button
            type="button"
            aria-label={m.RGBW_WHITE()}
            title={m.RGBW_WHITE()}
            onClick={() => set(RGBW_WHITE)}
            className={cn(swatch, white && 'ring-2 ring-foreground/70')}
            style={{ background: `rgb(${WHITE.join(',')})` }}
          />
          {QUICK_HUES.map((h) => (
            <button
              key={h}
              type="button"
              aria-label={`${m.COLOR()} ${h}°`}
              title={`${h}°`}
              onClick={() => set(hueToColor(h))}
              className={cn(swatch, !white && Math.abs(hue - h) < 8 && 'ring-2 ring-foreground/70')}
              style={{ background: `rgb(${hsvToRgb(h, 1).join(',')})` }}
            />
          ))}
        </div>
      </div>
    </Tile>
  );
};

// RGBW_AUTOMATIC.PROGRAM, in the order of rgbw.fn (optionRGBWControllerPrg0..6)
const PROGRAMS = [
  m.RGBW_PROGRAM_OFF,
  m.RGBW_PROGRAM_SLOW,
  m.RGBW_PROGRAM_NORMAL,
  m.RGBW_PROGRAM_FAST,
  m.RGBW_PROGRAM_FIRE,
  m.RGBW_PROGRAM_WATERFALL,
  m.RGBW_PROGRAM_TV,
];

// HM-LC-RGBW-WM channel 3: color programs
export const RgbwProgramControl = ({ channel }: { channel: Channel }) => {
  const setDataPoint = useSetDataPoint();
  const program = Number((channel.datapoints as Record<string, DatapointValue>).PROGRAM ?? 0);
  const name = PROGRAMS[program]?.() ?? String(program);
  return (
    <Tile status={channel.status}>
      <div className="flex flex-col gap-3 p-3.5">
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] leading-snug font-medium" title={channel.name}>
            {channel.name}
          </span>
          <span className="text-[13px] text-muted-foreground">{program === 0 ? m.RGBW_PROGRAM_NONE() : name}</span>
        </span>
        <NativeSelect
          aria-label={m.RGBW_PROGRAM_OF({ name: channel.name })}
          value={program}
          onChange={(event) =>
            setDataPoint(channel.interfaceName, channel.address, 'PROGRAM', Number(event.target.value))
          }
        >
          {PROGRAMS.map((label, index) => (
            <option key={index} value={index}>
              {label()}
            </option>
          ))}
        </NativeSelect>
      </div>
    </Tile>
  );
};

// HM-LC-DW-WM: the mix of the two whites (DUAL_WHITE_COLOR.LEVEL 0..1).
// Which end is warm depends on how the controller is wired and set up
// (the WebUI shows a curve from the settings), so it shows the value only.
export const DualWhiteColorControl = ({ channel }: { channel: Channel }) => {
  const setDataPoint = useSetDataPoint();
  const level = Math.round(Number((channel.datapoints as Record<string, DatapointValue>).LEVEL ?? 0) * 100);
  return (
    <Tile status={channel.status}>
      <div className="flex flex-col gap-3 p-3.5">
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] leading-snug font-medium" title={channel.name}>
            {channel.name}
          </span>
          <span className="text-[13px] text-muted-foreground">{m.DUAL_WHITE_VALUE({ percent: level })}</span>
        </span>
        <LevelBar
          label={m.DUAL_WHITE_OF({ name: channel.name })}
          value={level}
          onChange={(v) => setDataPoint(channel.interfaceName, channel.address, 'LEVEL', v / 100)}
        />
      </div>
    </Tile>
  );
};
