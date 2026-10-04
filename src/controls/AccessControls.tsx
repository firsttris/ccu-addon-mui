import { useEffect, useRef, useState } from 'react';
import FingerprintIcon from '~icons/lucide/fingerprint';
import UserIcon from '~icons/lucide/user-round';
import ZapIcon from '~icons/lucide/zap';
import { Channel, DatapointValue, Operation } from '../types/types';
import { useParamsetDescription, useSetDataPoint } from '../queries';
import { Tile } from '../components/Tile';
import { Switch } from '../components/ui/switch';
import { useEffects } from '../contexts/EffectsContext';
import { getLocale } from '../paraglide/runtime';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';
import { keyLabels } from './ButtonsControl';
import { useValueList } from './useValueList';

const index = (channel: Channel) => Number(channel.address.split(':')[1] ?? 0);
const byIndex = (channels: Channel[]) => [...channels].sort((a, b) => index(a) - index(b));
// The CCU's default name is "<type> <address>"
const isDefaultName = (channel: Channel) => channel.name.endsWith(channel.address.replace(/^[^.]*\./, ''));

const timeFormat = () => new Intl.DateTimeFormat(getLocale(), { hour: '2-digit', minute: '2-digit' });

// --- Access authorisations (HmIP-FWI Wiegand interface, HmIP-WKP keypad,
// the users of the door lock drives HmIP-DLD and HmIP-DLP, HmIP-FDC)

type Access = { label: string; granted: boolean; at: number };

const User = ({
  channel,
  label,
  onAccess,
}: {
  channel: Channel;
  label: string;
  onAccess: (access: Access) => void;
}) => {
  const setDataPoint = useSetDataPoint();
  const { data: description } = useParamsetDescription(channel.interfaceName, channel.address);
  const dp = channel.datapoints as Record<string, DatapointValue>;
  const authorization = useValueList(channel, 'ACCESS_AUTHORIZATION', []);
  const canWrite = (datapoint: string) => ((description?.[datapoint]?.operations ?? 0) & Operation.WRITE) !== 0;
  // HmIP-DLP and -FDC users (PERMISSION_TRANSCEIVER) have PERMISSION_STATE;
  // the others STATE: "channel authorised" (the WebUI's string table),
  // which they switch with ACCESS_AUTHORIZATION 0/1 (accessreceiver.fn)
  const permission = 'PERMISSION_STATE' in dp;
  const allowed = (permission ? dp.PERMISSION_STATE : dp.STATE) === true;
  const target = permission
    ? canWrite('PERMISSION_STATE')
      ? 'PERMISSION_STATE'
      : undefined
    : canWrite('STATE')
      ? 'STATE'
      : canWrite('ACCESS_AUTHORIZATION')
        ? 'ACCESS_AUTHORIZATION'
        : undefined;
  const written = useRef(0);
  const toggle = (checked: boolean) => {
    if (!target) return;
    written.current = Date.now();
    setDataPoint(
      channel.interfaceName,
      channel.address,
      target,
      target === 'ACCESS_AUTHORIZATION' ? (checked ? 1 : 0) : checked,
    );
  };

  // ACCESS_AUTHORIZATION arrives as event when someone used the reader;
  // the echo of switching a user here is no access
  const seen = useRef(dp.ACCESS_AUTHORIZATION);
  useEffect(() => {
    if (dp.ACCESS_AUTHORIZATION === seen.current) return;
    seen.current = dp.ACCESS_AUTHORIZATION;
    if (dp.ACCESS_AUTHORIZATION === null || dp.ACCESS_AUTHORIZATION === undefined) return;
    if (Date.now() - written.current < 5000) return;
    onAccess({ label, granted: authorization.name !== 'DISABLE', at: Date.now() });
  }, [dp.ACCESS_AUTHORIZATION, authorization.name, label, onAccess]);

  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full [&_svg]:size-3.5',
          allowed ? 'bg-green-500/15 text-green-700 dark:text-green-300' : 'bg-muted text-muted-foreground',
        )}
      >
        <UserIcon />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{label}</span>
      {target ? (
        <Switch aria-label={`${m.ACCESS_ALLOWED()}: ${label}`} checked={allowed} onCheckedChange={toggle} />
      ) : (
        <span className={cn('text-xs', allowed ? 'text-green-700 dark:text-green-300' : 'text-muted-foreground')}>
          {allowed ? m.ACCESS_ALLOWED() : m.ACCESS_BLOCKED()}
        </span>
      )}
    </li>
  );
};

// The users of a fingerprint reader or keypad: who may get in (switchable
// where the device allows it), and the last access, as it happens.
export const AccessControl = ({ channels }: { channels: Channel[] }) => {
  const effects = useEffects();
  const users = byIndex(channels);
  const { title, labels } = keyLabels(users.map((c) => c.name));
  const named = users.map((c, i) => (isDefaultName(c) ? m.USER_N({ n: i + 1 }) : labels[i]));
  const [last, setLast] = useState<Access | null>(null);
  const [flash, setFlash] = useState(0);
  const onAccess = useRef((access: Access) => {
    setLast(access);
    setFlash((f) => f + 1);
  }).current;
  const allowed = users.filter((c) => {
    const dp = c.datapoints as Record<string, DatapointValue>;
    return ('PERMISSION_STATE' in dp ? dp.PERMISSION_STATE : dp.STATE) === true;
  }).length;
  const tone = last ? (last.granted ? '34,197,94' : '239,68,68') : '161,161,170';

  return (
    <Tile status={users[0]?.status} role="group" aria-label={users.every(isDefaultName) ? m.ACCESS() : title}>
      <div className="flex flex-col gap-3 p-3.5">
        <div className="flex items-center gap-3">
          <div
            key={effects.on ? flash : 0}
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-xl border [&_svg]:size-6',
              last
                ? last.granted
                  ? 'text-green-600 dark:text-green-300'
                  : 'text-red-600 dark:text-red-400'
                : 'text-muted-foreground',
              effects.on && flash > 0 && 'fx-bloom',
            )}
            style={{
              background: `rgba(${tone},0.12)`,
              borderColor: `rgba(${tone},0.35)`,
              boxShadow:
                effects.on && last
                  ? `0 0 ${16 * effects.k}px rgba(${tone},${Math.min(1, 0.4 * effects.k)})`
                  : undefined,
            }}
          >
            <FingerprintIcon />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="line-clamp-2 text-[15px] leading-snug font-medium">
              {users.every(isDefaultName) ? m.ACCESS() : title}
            </span>
            <span role="status" className="text-[13px] text-muted-foreground">
              {last
                ? `${last.granted ? m.ACCESS_GRANTED() : m.ACCESS_DENIED()} · ${last.label} · ${timeFormat().format(last.at)}`
                : m.USERS_ALLOWED({ count: allowed, total: users.length })}
            </span>
          </div>
        </div>
        <ul className="flex flex-col divide-y" aria-label={m.USERS()}>
          {users.map((channel, i) => (
            <User key={channel.address} channel={channel} label={named[i]} onAccess={onAccess} />
          ))}
        </ul>
      </div>
    </Tile>
  );
};

// --- Wired access point (HmIPW-DRAP): voltage and current per bus line

const number = (value: DatapointValue | undefined) => (typeof value === 'number' ? value : undefined);
const format = (value: number, digits: number) =>
  new Intl.NumberFormat(getLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

// The wired bus runs on 24 V; below about 20 V devices drop out
const VOLTAGE_MIN = 20;

const BusLine = ({ channel }: { channel: Channel }) => {
  const { data: description } = useParamsetDescription(channel.interfaceName, channel.address);
  const dp = channel.datapoints as Record<string, DatapointValue>;
  const voltage = number(dp.VOLTAGE);
  const current = number(dp.CURRENT);
  const low = voltage !== undefined && voltage < VOLTAGE_MIN;
  const share = voltage !== undefined ? Math.max(0, Math.min(1, voltage / 26)) : 0;
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-muted/50 p-2.5">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <ZapIcon className={cn('size-3.5', low ? 'text-red-500' : 'text-amber-500')} aria-hidden />
        {m.BUS_LINE({ n: index(channel) })}
      </span>
      <span className={cn('text-lg leading-none font-semibold tabular-nums', low && 'text-red-600 dark:text-red-400')}>
        {voltage !== undefined ? `${format(voltage, 1)} V` : '–'}
      </span>
      <div className="h-1.5 overflow-hidden rounded-full bg-background" aria-hidden>
        <div
          className={cn('h-full rounded-full', low ? 'bg-red-500' : 'bg-amber-400')}
          style={{ width: `${share * 100}%` }}
        />
      </div>
      {current !== undefined && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {format(current, description?.CURRENT?.unit === 'A' ? 2 : 0)} {description?.CURRENT?.unit ?? 'mA'}
        </span>
      )}
    </div>
  );
};

export const AccessPointControl = ({ channels }: { channels: Channel[] }) => {
  const lines = byIndex(channels);
  const title = keyLabels(lines.map((c) => c.name)).title.replace(/\s+\S+:\d+$/, '') || m.ACCESS_POINT();
  return (
    <Tile status={lines[0]?.status} role="group" aria-label={title}>
      <div className="flex flex-col gap-3 p-3.5">
        <span className="line-clamp-2 text-[15px] leading-snug font-medium">{title}</span>
        <div className="grid grid-cols-2 gap-2">
          {lines.map((channel) => (
            <BusLine key={channel.address} channel={channel} />
          ))}
        </div>
      </div>
    </Tile>
  );
};
