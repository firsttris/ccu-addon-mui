import { useId } from 'react';
import { useEffects } from '../../contexts/EffectsContext';
import { cn } from '../../lib/utils';

export type RGB = [number, number, number];

// Warm white of an ordinary bulb
export const WARM: RGB = [251, 191, 36];

const rgba = ([r, g, b]: RGB, alpha: number) => `rgba(${r},${g},${b},${alpha})`;
// A lighter tone of the color for the bulb itself
const lighter = ([r, g, b]: RGB): RGB =>
  [r + (255 - r) * 0.55, g + (255 - g) * 0.55, b + (255 - b) * 0.55].map(Math.round) as RGB;

interface PendantLampProps {
  // 0 off .. 1 full brightness
  level: number;
  color?: RGB;
  // Number of state changes: each one swings the lamp
  changes: number;
}

// A pendant lamp hanging into the tile; switched on it casts a cone of
// light, stronger the brighter it is.
export const PendantLamp = ({ level, color = WARM, changes }: PendantLampProps) => {
  const effects = useEffects();
  const id = useId();
  const k = effects.k;
  const on = level > 0;
  // Dimmed lamps still glow a little
  const strength = on ? 0.25 + 0.75 * level : 0;
  const bulb = lighter(color);
  return (
    <svg
      aria-hidden
      viewBox="0 0 160 120"
      preserveAspectRatio="xMidYMin meet"
      className="pointer-events-none absolute inset-x-0 top-0 h-[120px] w-full overflow-visible"
    >
      <defs>
        <linearGradient id={`${id}-cone`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={rgba(bulb, 1)} stopOpacity="0.55" />
          <stop offset="0.5" stopColor={rgba(color, 1)} stopOpacity="0.16" />
          <stop offset="1" stopColor={rgba(color, 1)} stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-bulb`} x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <g
        key={effects.on ? changes : 0}
        className={cn(
          '[transform-box:fill-box] [transform-origin:50%_0]',
          effects.on && changes > 0 && (changes % 2 ? 'fx-swing-a' : 'fx-swing-b'),
        )}
      >
        <line x1="80" y1="-2" x2="80" y2="22" className="stroke-muted-foreground/50" strokeWidth="1.5" />
        {effects.on && (
          <polygon
            points="60,40 100,40 150,150 10,150"
            fill={`url(#${id}-cone)`}
            opacity={Math.min(1, Math.min(1.25, k) * strength)}
            className={cn('transition-opacity duration-500', on && changes > 0 && 'fx-flicker')}
          />
        )}
        {effects.on && (
          <circle
            cx="80"
            cy="41"
            r="10"
            fill={rgba(bulb, 1)}
            filter={`url(#${id}-bulb)`}
            opacity={Math.min(1, k * strength)}
            className="transition-opacity duration-400"
          />
        )}
        <path
          d="M58 40 Q58 22 80 22 Q102 22 102 40 Z"
          className={cn('transition-[fill] duration-400', on ? 'fill-zinc-500' : 'fill-muted-foreground/30')}
          stroke={on ? rgba(bulb, 0.6) : 'transparent'}
          strokeWidth="1"
        />
        <circle
          cx="80"
          cy="41"
          r="5"
          fill={on ? rgba(bulb, 1) : undefined}
          className={cn('transition-[fill] duration-300', !on && 'fill-muted-foreground/40')}
        />
      </g>
    </svg>
  );
};

// The tile's own light: a glow from the lamp and a border in its color
export const litTileStyle = (level: number, color: RGB, effectsOn: boolean, k: number) => {
  if (level <= 0) return undefined;
  const a = (alpha: number) => Math.min(1, alpha * k * (0.35 + 0.65 * level));
  return {
    borderColor: rgba(color, 0.42),
    background: effectsOn
      ? `radial-gradient(85% 75% at 50% 18%, ${rgba(color, a(0.2))}, transparent 72%), radial-gradient(70% 38% at 50% 100%, ${rgba(color, a(0.14))}, transparent 75%), var(--card)`
      : `color-mix(in oklab, ${rgba(color, 1)} 14%, var(--card))`,
    boxShadow: effectsOn ? `0 12px 40px -12px ${rgba(color, a(0.5))}` : undefined,
  };
};
