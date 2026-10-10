import WindIcon from '~icons/lucide/wind';
import CloudRainIcon from '~icons/lucide/cloud-rain';
import SunIcon from '~icons/lucide/sun';
import SunDimIcon from '~icons/lucide/sun-dim';
import DropletsIcon from '~icons/lucide/droplets';
import type { ReactNode } from 'react';
import type { Channel, DatapointValue } from '../types/types';
import { Tile } from '../components/Tile';
import { useEffects } from '../contexts/EffectsContext';
import { m } from '../paraglide/messages';
import { cn, formatNumber } from '../lib/utils';

export const number = (value: DatapointValue | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
export const format = (value: number, digits = 1) => formatNumber(value, digits, digits);

// Dew point by the Magnus formula (°C), good to ±0.4 °C between -45 and 60 °C
export const dewPoint = (temperature: number, humidity: number) => {
  const a = 17.62;
  const b = 243.12;
  const gamma = Math.log(Math.max(1, humidity) / 100) + (a * temperature) / (b + temperature);
  return (b * gamma) / (a - gamma);
};

export type Comfort = 'dry' | 'comfortable' | 'humid';
// Indoor air: below 35 % feels dry, above 65 % mould can grow
export const comfort = (humidity: number): Comfort => (humidity < 35 ? 'dry' : humidity > 65 ? 'humid' : 'comfortable');

const comfortLabel: Record<Comfort, () => string> = {
  dry: m.AIR_DRY,
  comfortable: m.AIR_COMFORTABLE,
  humid: m.AIR_HUMID,
};

// Cold blue to warm orange, for the glow behind the temperature
const temperatureColor = (t: number) => {
  const stops: [number, [number, number, number]][] = [
    [-10, [96, 165, 250]],
    [10, [56, 189, 248]],
    [20, [52, 211, 153]],
    [26, [251, 191, 36]],
    [35, [249, 115, 22]],
  ];
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i];
    const [t0, c0] = stops[i - 1];
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return c0.map((c, k) => Math.round(c + (c1[k] - c) * f)) as [number, number, number];
    }
  }
  return stops[stops.length - 1][1];
};

const HumidityRing = ({ humidity }: { humidity: number }) => {
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const level = comfort(humidity);
  return (
    // biome-ignore lint/a11y/useSemanticElements: drawn by the app; the native meter draws itself
    <div
      className="relative size-[68px] shrink-0"
      role="meter"
      aria-label={m.HUMIDITY()}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={humidity}
    >
      <svg viewBox="0 0 64 64" className="size-full -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="5" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(100, humidity) / 100)}
          className={cn(
            'transition-[stroke-dashoffset] duration-700',
            level === 'dry' ? 'stroke-amber-500' : level === 'humid' ? 'stroke-blue-500' : 'stroke-sky-400',
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <DropletsIcon className="size-3.5 text-sky-500" aria-hidden />
        <span className="text-sm font-semibold tabular-nums">{Math.round(humidity)} %</span>
      </div>
    </div>
  );
};

export const Extra = ({
  icon,
  label,
  value,
  active,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  active?: boolean;
}) => (
  <div className="flex min-w-0 items-center gap-2 rounded-xl bg-muted/50 px-2.5 py-2">
    <span className={cn('shrink-0 [&_svg]:size-4', active ? 'text-sky-500' : 'text-muted-foreground')}>{icon}</span>
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="truncate text-[11px] text-muted-foreground">{label}</span>
      <span className="truncate text-[13px] font-medium tabular-nums">{value}</span>
    </span>
  </div>
);

// Temperature and humidity sensors and weather stations: the temperature
// large, the humidity as a ring with its comfort and the dew point, and
// what a weather station adds (wind, rain, brightness, sunshine).
export const ClimateSensorControl = ({ channel }: { channel: Channel }) => {
  const effects = useEffects();
  const dp = channel.datapoints as Record<string, DatapointValue>;
  // HmIP calls it ACTUAL_TEMPERATURE, BidCos weather sensors TEMPERATURE
  const temperature = number(dp.ACTUAL_TEMPERATURE) ?? number(dp.TEMPERATURE);
  const humidity = number(dp.HUMIDITY) ?? number(dp.ACTUAL_HUMIDITY);
  const wind = number(dp.WIND_SPEED);
  const illumination = number(dp.ILLUMINATION) ?? number(dp.BRIGHTNESS);
  const sunshine = number(dp.SUNSHINEDURATION);
  const raining = typeof dp.RAINING === 'boolean' ? dp.RAINING : undefined;
  const rainCounter = number(dp.RAIN_COUNTER);
  const [r, g, b] = temperature !== undefined ? temperatureColor(temperature) : [161, 161, 170];
  const a = (alpha: number) => Math.min(1, alpha * effects.k);

  const extras: ReactNode[] = [];
  if (wind !== undefined)
    extras.push(
      <Extra key="wind" icon={<WindIcon />} label={m.WIND()} value={`${format(wind)} km/h`} active={wind >= 20} />,
    );
  if (raining !== undefined || rainCounter !== undefined)
    extras.push(
      <Extra
        key="rain"
        icon={<CloudRainIcon />}
        label={m.RAIN()}
        value={raining ? m.IS_RAINING() : rainCounter !== undefined ? `${format(rainCounter)} mm` : m.DRY()}
        active={raining}
      />,
    );
  if (illumination !== undefined)
    extras.push(
      <Extra key="lux" icon={<SunDimIcon />} label={m.BRIGHTNESS()} value={`${format(illumination, 0)} lx`} />,
    );
  if (sunshine !== undefined)
    extras.push(
      <Extra
        key="sun"
        icon={<SunIcon />}
        label={m.SUNSHINE()}
        value={`${format(sunshine, 0)} min`}
        active={sunshine > 0}
      />,
    );

  return (
    <Tile
      status={channel.status}
      role="group"
      aria-label={channel.name}
      style={
        effects.on && temperature !== undefined
          ? {
              background: `radial-gradient(70% 80% at 0% 0%, rgba(${r},${g},${b},${a(0.13)}), transparent 70%), var(--card)`,
            }
          : undefined
      }
    >
      <div className="flex flex-col gap-3 p-4">
        <span className="line-clamp-2 text-[15px] leading-snug font-medium" title={channel.name}>
          {channel.name}
        </span>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span
              // A name only goes on an element with a role: read as one value with its unit
              role="img"
              className="text-[44px] leading-none font-semibold tracking-[-0.04em] tabular-nums"
              style={
                effects.on && temperature !== undefined
                  ? { textShadow: `0 0 ${18 * effects.k}px rgba(${r},${g},${b},0.45)` }
                  : undefined
              }
              aria-label={`${m.TEMPERATURE()} ${temperature !== undefined ? `${format(temperature)} °C` : '–'}`}
            >
              {temperature !== undefined ? format(temperature) : '–'}
              <span className="ml-0.5 align-top text-lg font-medium text-muted-foreground">°C</span>
            </span>
            {humidity !== undefined && temperature !== undefined && (
              <span className="mt-1.5 text-[13px] text-muted-foreground">
                {m.DEW_POINT()} {format(dewPoint(temperature, humidity))} °C
              </span>
            )}
          </div>
          {humidity !== undefined && (
            <div className="flex flex-col items-center gap-1">
              <HumidityRing humidity={humidity} />
              <span
                className={cn(
                  'text-[11px] font-medium',
                  comfort(humidity) === 'dry'
                    ? 'text-amber-700 dark:text-amber-300'
                    : comfort(humidity) === 'humid'
                      ? 'text-blue-700 dark:text-blue-300'
                      : 'text-muted-foreground',
                )}
              >
                {comfortLabel[comfort(humidity)]()}
              </span>
            </div>
          )}
        </div>
        {extras.length > 0 && <div className="grid grid-cols-2 gap-2">{extras}</div>}
      </div>
    </Tile>
  );
};
