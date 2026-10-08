import { CSSProperties, ReactNode, useEffect, useId, useState } from 'react';
import ArrowRightIcon from '~icons/lucide/arrow-right';
import { useEffects } from '../../contexts/EffectsContext';
import { cn } from '../../lib/utils';

export type HeroTone = 'sky' | 'green' | 'amber' | 'red';

const tones: Record<HeroTone, { from: string; to: string; text: string; disc: string }> = {
  sky: { from: '#38bdf8', to: '#8b5cf6', text: 'text-sky-600 dark:text-sky-300', disc: 'from-sky-500/20 to-violet-500/10' },
  green: { from: '#4ade80', to: '#10b981', text: 'text-green-600 dark:text-green-300', disc: 'from-green-500/25 to-emerald-500/10' },
  amber: { from: '#fbbf24', to: '#f97316', text: 'text-amber-600 dark:text-amber-300', disc: 'from-amber-500/25 to-orange-500/10' },
  red: { from: '#f87171', to: '#e11d48', text: 'text-red-600 dark:text-red-400', disc: 'from-red-500/20 to-rose-500/10' },
};

// Bits of confetti flying out of the ring once the update is done
const CONFETTI = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2 + (i % 2) * 0.2;
  const reach = 74 + (i % 3) * 14;
  return {
    x: Math.round(Math.cos(angle) * reach),
    y: Math.round(Math.sin(angle) * reach),
    color: ['#38bdf8', '#8b5cf6', '#4ade80', '#fbbf24', '#f472b6'][i % 5],
    round: i % 3 === 0,
    delay: (i % 4) * 40,
  };
});

const R = 52;
const CIRCUMFERENCE = 2 * Math.PI * R;

// The picture of the update, like the pictures on the tiles: a ring that
// fills over the whole update, the current step's symbol in the middle
// (it comes in anew with every step), a glow behind and waves while it runs.
// Without progress the ring circles; at the end confetti flies.
export const UpdateHero = ({
  icon,
  iconKey,
  motion,
  progress,
  tone = 'sky',
  running = false,
  celebrate = false,
}: {
  icon: ReactNode;
  iconKey: string;
  motion?: string;
  progress?: number;
  tone?: HeroTone;
  running?: boolean;
  celebrate?: boolean;
}) => {
  const effects = useEffects();
  const gradient = useId();
  const colors = tones[tone];
  // The ring fills from empty when it first shows, so the end can be seen
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const filled = progress === undefined ? 0.28 : shown || !effects.on ? Math.max(0, Math.min(1, progress)) : 0;

  return (
    <div aria-hidden className="relative mx-auto flex size-32 shrink-0 items-center justify-center">
      {effects.on && (
        <div
          className={cn('absolute -inset-4 rounded-full blur-2xl transition-[background] duration-700', running && 'fx-breathe')}
          style={{ background: `radial-gradient(circle, ${colors.from}${effects.k > 1 ? '59' : '38'}, transparent 70%)` }}
        />
      )}
      {effects.on &&
        running &&
        [0, 0.9].map((delay) => (
          <span
            key={delay}
            className="fx-wave absolute inset-4 rounded-full border-2"
            style={{ borderColor: `${colors.from}66`, animationDelay: `${delay}s` }}
          />
        ))}
      <svg viewBox="0 0 120 120" className={cn('absolute inset-0 size-full -rotate-90', progress === undefined && effects.on && 'animate-spin [animation-duration:1.4s]')}>
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={colors.from} />
            <stop offset="100%" stopColor={colors.to} />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="6" className="stroke-muted" />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          stroke={`url(#${gradient})`}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - filled)}
          className="transition-[stroke-dashoffset] duration-700 ease-[cubic-bezier(.4,0,.2,1)]"
        />
      </svg>
      <span
        className={cn(
          'relative flex size-20 items-center justify-center rounded-full bg-gradient-to-br shadow-inner ring-1 ring-black/5 transition-colors duration-500 dark:ring-white/10 [&_svg]:size-9',
          colors.disc,
          colors.text,
        )}
      >
        <span key={iconKey} className={cn('flex', effects.on && 'fx-bloom')}>
          <span className={cn('flex', effects.on && motion)}>{icon}</span>
        </span>
      </span>
      {celebrate &&
        effects.on &&
        CONFETTI.map((bit, i) => (
          <span
            key={i}
            className={cn('fx-confetti absolute top-1/2 left-1/2 size-2', bit.round ? 'rounded-full' : 'rounded-[2px]')}
            style={
              {
                background: bit.color,
                '--x': `${bit.x}px`,
                '--y': `${bit.y}px`,
                animationDelay: `${200 + bit.delay}ms`,
              } as CSSProperties
            }
          />
        ))}
    </div>
  );
};

// The button that starts the update, in the colors of the ring
export const updateButton = 'press bg-gradient-to-r from-sky-500 to-violet-500 text-white shadow-md shadow-sky-500/25 hover:opacity-95';

// "1.0.0 → 1.0.1": the version installed and the new one
export const VersionJump = ({ from, to }: { from: string; to: string }) => {
  const effects = useEffects();
  return (
    <div className="flex items-center justify-center gap-2 text-sm font-medium tabular-nums">
      <span className="rounded-full border px-2.5 py-0.5 text-muted-foreground">{from}</span>
      <ArrowRightIcon className={cn('size-4 text-muted-foreground', effects.on && 'fx-nudge')} />
      <span className="relative overflow-hidden rounded-full bg-gradient-to-r from-sky-500 to-violet-500 px-2.5 py-0.5 text-white shadow-sm shadow-sky-500/30">
        {to}
        {effects.on && (
          <span className="fx-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        )}
      </span>
    </div>
  );
};
