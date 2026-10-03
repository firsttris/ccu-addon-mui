import * as React from 'react';
import RadioIcon from '~icons/lucide/radio-tower';
import BatteryLowIcon from '~icons/lucide/battery-low';
import { ChannelStatus } from '../types/types';
import { cn } from '../lib/utils';
import { m } from '../paraglide/messages';

const StatusStrip = ({ severity, icon, children }: { severity: 'warning' | 'error'; icon: React.ReactNode; children: React.ReactNode }) => (
  <div
    role="status"
    className={cn(
      'flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium [&_svg]:size-3.5',
      severity === 'error'
        ? 'bg-red-500/15 text-red-700 dark:text-red-300'
        : 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
    )}
  >
    {icon}
    {children}
  </div>
);

interface TileProps extends React.ComponentProps<'div'> {
  // Battery and reachability of the device, shown below the content
  status?: ChannelStatus;
  // Lit tiles bring their own background (no light edge)
  lit?: boolean;
}

// The surface of a control on the dashboard
export const Tile = ({ className, status, lit, children, ...props }: TileProps) => (
  <div
    data-slot="tile"
    data-lit={lit || undefined}
    className={cn(
      'tile-edge relative flex flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-xs transition-[box-shadow,background,border-color] duration-500 dark:shadow-none',
      className,
    )}
    {...props}
  >
    {/* The values of an unreachable device are stale (often all 0) */}
    <div className={cn('flex min-h-0 flex-1 flex-col', status?.UNREACH && 'opacity-45 grayscale')}>{children}</div>
    {status?.UNREACH && (
      <StatusStrip severity="error" icon={<RadioIcon />}>
        {m.UNREACH()}
      </StatusStrip>
    )}
    {status?.LOW_BAT && (
      <StatusStrip severity="warning" icon={<BatteryLowIcon />}>
        {m.LOW_BAT()}
      </StatusStrip>
    )}
  </div>
);
