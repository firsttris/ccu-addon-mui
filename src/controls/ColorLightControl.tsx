import { useRef, useState } from 'react';
import type { Channel, DatapointValue } from '../types/types';
import { useSetDataPoint } from '../queries';
import { Tile } from '../components/Tile';
import { useEffects } from '../contexts/EffectsContext';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';
import { useStateChanges } from './SwitchControl';
import { dimLevel } from './DimmerControl';
import { litTileStyle, PendantLamp, type RGB } from './light/PendantLamp';
import { LevelBar } from './light/LevelBar';

// Hue 0..360, saturation 0..1 at full value
export const hsvToRgb = (hue: number, saturation: number): RGB => {
  const h = (((hue % 360) + 360) % 360) / 60;
  const c = saturation;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const [r, g, b] =
    h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  const m0 = 1 - c;
  return [r, g, b].map((v) => Math.round((v + m0) * 255)) as RGB;
};

// Color of white light by its temperature in kelvin (approximation by
// Tanner Helland, good for 1000-12000 K)
export const kelvinToRgb = (kelvin: number): RGB => {
  const t = kelvin / 100;
  const clamp = (v: number) => Math.round(Math.max(0, Math.min(255, v)));
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [clamp(r), clamp(g), clamp(b)];
};

const WHITES = [2700, 4000, 6500];
const COLORS = [0, 30, 55, 120, 200, 275];

export const HueBar = ({ label, hue, onChange }: { label: string; hue: number; onChange: (hue: number) => void }) => {
  const bar = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? hue;
  const at = (clientX: number) => {
    // biome-ignore lint/style/noNonNullAssertion: only called from the pointer events of the mounted element
    const rect = bar.current!.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * 360);
  };
  return (
    <div
      ref={bar}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={shown}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag(at(event.clientX));
      }}
      onPointerMove={(event) => drag !== null && setDrag(at(event.clientX))}
      onPointerUp={() => {
        if (drag !== null) onChange(drag);
        setDrag(null);
      }}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={(event) => {
        const delta = event.key === 'ArrowRight' ? 10 : event.key === 'ArrowLeft' ? -10 : 0;
        if (!delta) return;
        event.preventDefault();
        onChange((hue + delta + 360) % 360);
      }}
      className="relative h-4 cursor-ew-resize touch-none rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      style={{ background: 'linear-gradient(90deg,#f00,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00)' }}
    >
      <div
        className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-md"
        style={{ left: `${(shown / 360) * 100}%`, background: `rgb(${hsvToRgb(shown, 1).join(',')})` }}
      />
    </div>
  );
};

// Color and tunable-white lights (UNIVERSAL_LIGHT_RECEIVER, e.g. HmIP-RGBW):
// the lamp shines in the light's color; brightness, hue and a few quick
// colors and whites below. What can be set follows the datapoints the
// channel has in its operating mode.
export const ColorLightControl = ({ channel }: { channel: Channel }) => {
  const setDataPoint = useSetDataPoint();
  const effects = useEffects();
  const dp = channel.datapoints as Record<string, DatapointValue>;
  const level = dimLevel(channel);
  const on = level > 0;
  const { changes, markRequested } = useStateChanges(on);
  const hasHue = typeof dp.HUE === 'number';
  const hasWhite = typeof dp.COLOR_TEMPERATURE === 'number';
  const hue = Number(dp.HUE ?? 0);
  const saturation = Number(dp.SATURATION ?? 1);
  const kelvin = Number(dp.COLOR_TEMPERATURE ?? 2700);
  const color: RGB =
    hasHue && saturation > 0.05 ? hsvToRgb(hue, saturation) : hasWhite ? kelvinToRgb(kelvin) : [251, 191, 36];
  const set = (datapoint: string, value: number) =>
    setDataPoint(channel.interfaceName, channel.address, datapoint, value);
  const lastLevel = useRef(level || 100);
  if (level > 0) lastLevel.current = level;

  const toggle = () => {
    markRequested(!on);
    set('LEVEL', on ? 0 : lastLevel.current / 100);
  };
  const pickColor = (h: number) => {
    set('HUE', h);
    set('SATURATION', 1);
    if (!on) set('LEVEL', lastLevel.current / 100);
  };
  const pickWhite = (k: number) => {
    if (hasWhite) set('COLOR_TEMPERATURE', k);
    else set('SATURATION', 0);
    if (!on) set('LEVEL', lastLevel.current / 100);
  };

  const state = on ? m.DIMMED_TO({ percent: level }) : m.OFF();
  const swatch = 'press size-6 rounded-full border border-black/10 ring-offset-2 ring-offset-card dark:border-white/15';
  return (
    <Tile
      status={channel.status}
      lit={on}
      className="col-span-2"
      style={litTileStyle(level / 100, color, effects.on, effects.k)}
    >
      <button
        type="button"
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
          <span className={cn('text-[13px]', on ? 'text-foreground/80' : 'text-muted-foreground')}>{state}</span>
        </span>
      </button>
      <div className="flex flex-col gap-3 px-3.5 pb-3.5">
        <LevelBar
          label={m.BRIGHTNESS_OF({ name: channel.name })}
          value={level}
          color={color}
          onChange={(v) => set('LEVEL', v / 100)}
        />
        {hasHue && <HueBar label={m.COLOR_OF({ name: channel.name })} hue={hue} onChange={pickColor} />}
        {/* biome-ignore lint/a11y/useSemanticElements: a fieldset brings its own border and spacing */}
        <div className="flex flex-wrap justify-between gap-1.5" role="group" aria-label={m.QUICK_COLORS()}>
          {(hasWhite || hasHue) &&
            WHITES.map((k) => (
              <button
                key={k}
                type="button"
                aria-label={`${k} K`}
                title={`${k} K`}
                onClick={() => pickWhite(k)}
                className={cn(
                  swatch,
                  hasWhite &&
                    Math.abs(kelvin - k) < 300 &&
                    (!hasHue || saturation < 0.05) &&
                    'ring-2 ring-foreground/70',
                )}
                style={{ background: `rgb(${kelvinToRgb(k).join(',')})` }}
              />
            ))}
          {hasHue &&
            COLORS.map((h) => (
              <button
                key={h}
                type="button"
                aria-label={`${m.COLOR()} ${h}°`}
                title={`${h}°`}
                onClick={() => pickColor(h)}
                className={cn(swatch, saturation > 0.5 && Math.abs(hue - h) < 8 && 'ring-2 ring-foreground/70')}
                style={{ background: `rgb(${hsvToRgb(h, 1).join(',')})` }}
              />
            ))}
        </div>
      </div>
    </Tile>
  );
};
