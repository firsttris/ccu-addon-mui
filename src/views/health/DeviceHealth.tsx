import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import BatteryIcon from '~icons/lucide/battery-full';
import BatteryLowIcon from '~icons/lucide/battery-low';
import BatteryWarningIcon from '~icons/lucide/battery-warning';
import WifiOffIcon from '~icons/lucide/wifi-off';
import AntennaIcon from '~icons/lucide/antenna';
import CircleCheckIcon from '~icons/lucide/circle-check';
import { useDeviceHealth } from '../../queries';
import { usePageTitle } from '../../contexts/PageTitleContext';
import { useWebSocketContext } from '../../hooks/useWebsocket';
import { Badge } from '../../components/ui/badge';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { Panel } from '../setup/Panel';
import { m } from '../../paraglide/messages';
import { getLocale } from '../../paraglide/runtime';
import { cn } from '../../lib/utils';
import type { DeviceHealth as Health } from '../../types/protocol';
import { bars, battery, flags, formatAge, lastSeen, needsAttention, signal, urgency, type Flag } from './deviceHealth';

const flagLabels: Record<Flag, () => string> = {
  unreach: m.HEALTH_UNREACH,
  wasUnreach: m.HEALTH_WAS_UNREACH,
  configPending: m.HEALTH_CONFIG_PENDING,
  updatePending: m.HEALTH_UPDATE_PENDING,
  sabotage: m.HEALTH_SABOTAGE,
  dutyCycle: m.HEALTH_DUTY_CYCLE,
};
const flagVariant = (flag: Flag) =>
  flag === 'unreach' || flag === 'sabotage'
    ? 'destructive'
    : flag === 'wasUnreach' || flag === 'dutyCycle'
      ? 'warning'
      : 'info';

const volts = (v: number) =>
  `${v.toLocaleString(getLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} V`;

const Battery = ({ device }: { device: Health }) => {
  const { state, voltage, limit } = battery(device);
  if (state === 'none') return <span className="text-muted-foreground">–</span>;
  const Icon = state === 'empty' ? BatteryWarningIcon : state === 'low' ? BatteryLowIcon : BatteryIcon;
  const label = state === 'empty' ? m.HEALTH_BATTERY_EMPTY() : state === 'low' ? m.HEALTH_BATTERY_LOW() : m.STATUS_OK();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 tabular-nums',
        state === 'empty' && 'font-medium text-red-700 dark:text-red-300',
        state === 'low' && 'font-medium text-amber-700 dark:text-amber-300',
      )}
      aria-label={`${m.HEALTH_BATTERY()}: ${label}${voltage !== undefined ? `, ${volts(voltage)}` : ''}`}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex flex-wrap items-baseline gap-x-1.5 md:flex-col md:items-start">
        <span className="whitespace-nowrap">{voltage !== undefined ? volts(voltage) : label}</span>
        {limit !== undefined && (
          <span className="text-xs font-normal whitespace-nowrap text-muted-foreground">
            {m.HEALTH_LIMIT({ limit: volts(limit) })}
          </span>
        )}
      </span>
    </span>
  );
};

const Signal = ({ device }: { device: Health }) => {
  const { state, rssi } = signal(device);
  if (rssi === undefined) return <span className="text-muted-foreground">–</span>;
  const filled = bars(rssi);
  const color = state === 'good' ? 'bg-green-500' : state === 'fair' ? 'bg-amber-500' : 'bg-red-500';
  const label =
    state === 'good' ? m.HEALTH_SIGNAL_GOOD() : state === 'fair' ? m.HEALTH_SIGNAL_FAIR() : m.HEALTH_SIGNAL_POOR();
  return (
    <span
      className="inline-flex items-center gap-2 whitespace-nowrap tabular-nums"
      aria-label={`${m.HEALTH_SIGNAL()}: ${label}, ${rssi} dBm`}
    >
      <span className="flex h-4 items-end gap-0.5" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn('w-1 rounded-sm', i <= filled ? color : 'bg-muted')}
            style={{ height: `${i * 25}%` }}
          />
        ))}
      </span>
      {rssi} dBm
    </span>
  );
};

type Summary = { key: string; label: string; count: number; icon: React.ReactNode; tone: string };

// Batteries, radio and reachability of all devices on one page. The CCU
// keeps these on each device's maintenance channel (:0); the WebUI only
// shows them device by device and as service messages.
export const DeviceHealth = () => {
  usePageTitle(m.HEALTH());
  const { userLevel } = useWebSocketContext();
  const { data: devices, isError } = useDeviceHealth();
  const [showAll, setShowAll] = useState<boolean | null>(null);
  const now = Math.floor(Date.now() / 1000);
  const locale = getLocale();

  const sorted = useMemo(
    () => [...(devices ?? [])].sort((a, b) => urgency(b) - urgency(a) || a.name.localeCompare(b.name)),
    [devices],
  );
  const attention = sorted.filter(needsAttention);

  if (isError) {
    return (
      <Panel aria-label={m.HEALTH()}>
        <p>{m.HEALTH_FAILED()}</p>
      </Panel>
    );
  }
  if (!devices) {
    return (
      <Panel aria-label={m.HEALTH()} aria-busy>
        <PanelSkeleton lines={6} />
      </Panel>
    );
  }

  const summaries: Summary[] = [
    {
      key: 'unreach',
      label: m.HEALTH_UNREACH(),
      count: sorted.filter((d) => flags(d).includes('unreach')).length,
      icon: <WifiOffIcon />,
      tone: 'text-red-700 dark:text-red-300',
    },
    {
      key: 'empty',
      label: m.HEALTH_BATTERY_EMPTY(),
      count: sorted.filter((d) => battery(d).state === 'empty').length,
      icon: <BatteryWarningIcon />,
      tone: 'text-red-700 dark:text-red-300',
    },
    {
      key: 'low',
      label: m.HEALTH_BATTERY_LOW(),
      count: sorted.filter((d) => battery(d).state === 'low').length,
      icon: <BatteryLowIcon />,
      tone: 'text-amber-700 dark:text-amber-300',
    },
    {
      key: 'poor',
      label: m.HEALTH_SIGNAL_POOR(),
      count: sorted.filter((d) => signal(d).state === 'poor').length,
      icon: <AntennaIcon />,
      tone: 'text-amber-700 dark:text-amber-300',
    },
  ];
  // Shows the devices that need attention first, all when none do
  const all = showAll ?? attention.length === 0;
  const shown = all ? sorted : attention;

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={m.HEALTH_SUMMARY()}>
        {summaries.map((s) => (
          <li
            key={s.key}
            className="flex flex-col gap-1 rounded-xl border bg-card p-4 shadow-xs"
            aria-label={`${s.label}: ${s.count}`}
          >
            <span
              className={cn(
                'flex items-center gap-2 text-sm [&_svg]:size-4',
                s.count > 0 ? s.tone : 'text-muted-foreground',
              )}
            >
              {s.icon}
              {s.label}
            </span>
            <span className={cn('text-2xl font-semibold tabular-nums', s.count === 0 && 'text-muted-foreground')}>
              {s.count}
            </span>
          </li>
        ))}
      </ul>
      <Panel aria-label={m.HEALTH_DEVICES()}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2>{m.HEALTH_DEVICES()}</h2>
          {/* biome-ignore lint/a11y/useSemanticElements: a fieldset brings its own border and spacing */}
          <div className="flex rounded-lg border p-0.5 text-sm" role="group">
            {[
              { value: false, label: m.HEALTH_ATTENTION({ count: attention.length }) },
              { value: true, label: m.HEALTH_ALL({ count: sorted.length }) },
            ].map((option) => (
              <button
                key={String(option.value)}
                type="button"
                aria-pressed={all === option.value}
                onClick={() => setShowAll(option.value)}
                className={cn(
                  'rounded-md px-3 py-1',
                  all === option.value ? 'bg-secondary font-medium' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="flex items-center gap-2">
            <CircleCheckIcon className="size-4 text-green-600" />
            {m.HEALTH_ALL_OK()}
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border" aria-label={m.HEALTH_DEVICES()}>
            {shown.map((device) => {
              const seen = lastSeen(device);
              return (
                <li
                  key={`${device.interfaceName}-${device.address}`}
                  aria-label={device.name}
                  className="relative grid grid-cols-1 gap-x-4 gap-y-1.5 px-3 py-2.5 text-sm md:grid-cols-[minmax(0,1fr)_8rem_7rem_11rem] md:items-center"
                >
                  <span className="flex min-w-0 flex-col">
                    {userLevel === 'admin' ? (
                      <Link
                        to="/device/$interfaceName/$address"
                        params={{ interfaceName: device.interfaceName, address: device.address }}
                        className="truncate font-medium after:absolute after:inset-0 hover:underline"
                      >
                        {device.name}
                      </Link>
                    ) : (
                      <span className="truncate font-medium">{device.name}</span>
                    )}
                    <span className="truncate text-xs text-muted-foreground">
                      {[device.roomName, device.type].filter(Boolean).join(' · ')}
                    </span>
                    {flags(device).length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {flags(device).map((flag) => (
                          <Badge key={flag} variant={flagVariant(flag)}>
                            {flagLabels[flag]()}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </span>
                  <Battery device={device} />
                  <Signal device={device} />
                  <span
                    className="text-muted-foreground"
                    title={seen ? new Date(seen * 1000).toLocaleString(locale) : undefined}
                  >
                    {seen ? m.HEALTH_LAST_SEEN({ age: formatAge(seen, now, locale) }) : '–'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs">{m.HEALTH_HINT()}</p>
      </Panel>
    </>
  );
};
