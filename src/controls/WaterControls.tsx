import type { ReactNode } from 'react';
import DropletIcon from '~icons/lucide/droplet';
import DropletOffIcon from '~icons/lucide/droplet-off';
import ArrowUpIcon from '~icons/lucide/arrow-up-to-line';
import ArrowDownIcon from '~icons/lucide/arrow-down-to-line';
import SquareIcon from '~icons/lucide/square';
import LockIcon from '~icons/lucide/lock';
import TimerIcon from '~icons/lucide/timer';
import GaugeIcon from '~icons/lucide/gauge';
import WavesIcon from '~icons/lucide/waves';
import SigmaIcon from '~icons/lucide/sigma';
import BatteryIcon from '~icons/lucide/battery-medium';
import type { Channel, DatapointValue } from '../types/types';
import { Tile } from '../components/Tile';
import { useParamsetDescription, useSetDataPoint } from '../queries';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';
import { DetectorTile } from './DetectorControls';
import { Extra, format, number } from './ClimateSensorControl';
import { MeasureTile, measured } from './SensorControls';
import { useValueList } from './useValueList';

const datapoints = (channel: Channel) => channel.datapoints as Record<string, DatapointValue>;

const button =
  'press flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border bg-background/60 text-[13px] font-medium hover:bg-accent disabled:opacity-50 [&_svg]:size-4';

// The unit the device states for a value (e.g. "l/h"), else a fallback
const useUnit = (channel: Channel, name: string, fallback: string) => {
  const { data } = useParamsetDescription(channel.interfaceName, channel.address);
  return data?.[name]?.unit || fallback;
};

// A device channel with a name, a status line and buttons below
const ActuatorTile = ({
  channel,
  status,
  active,
  icon,
  children,
}: {
  channel: Channel;
  status: string;
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
}) => (
  <Tile status={channel.status} role="group" aria-label={channel.name} lit={active}>
    <div className="flex items-center gap-3 p-4 pb-3">
      <span
        aria-hidden
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-full border [&_svg]:size-5',
          active
            ? 'border-sky-500/40 bg-sky-500/15 text-sky-600 dark:text-sky-300'
            : 'bg-muted/50 text-muted-foreground',
        )}
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="line-clamp-2 text-[15px] leading-snug font-medium" title={channel.name}>
          {channel.name}
        </span>
        <span
          role="status"
          className={cn('text-[13px] font-medium', active ? 'text-sky-700 dark:text-sky-300' : 'text-muted-foreground')}
        >
          {status}
        </span>
      </div>
    </div>
    <div className="flex flex-col gap-2 px-4 pb-4">{children}</div>
  </Tile>
);

// --- Irrigation (HmIP-WSM, ELV-SH-WSM), as the WebUI's switch.fn
// CreateWaterSwitch: open and close the valve. Channels with ON_TIME can
// also open for a while, ON_TIME first and then STATE, as for all HomeMatic
// actuators.

const WATER_MINUTES = [10, 30, 60];

export const WaterSwitchControl = ({ channel }: { channel: Channel }) => {
  const setDataPoint = useSetDataPoint();
  const { data: description } = useParamsetDescription(channel.interfaceName, channel.address);
  const running = datapoints(channel).STATE === true;
  const timed = Boolean(description?.ON_TIME);
  const set = (on: boolean) => setDataPoint(channel.interfaceName, channel.address, 'STATE', on);
  const openFor = (minutes: number) => {
    setDataPoint(channel.interfaceName, channel.address, 'ON_TIME', minutes * 60);
    set(true);
  };
  return (
    <ActuatorTile
      channel={channel}
      status={running ? m.WATER_RUNNING() : m.WATER_CLOSED()}
      active={running}
      icon={running ? <DropletIcon /> : <DropletOffIcon />}
    >
      <div className="flex gap-2">
        <button type="button" className={button} onClick={() => set(true)} aria-pressed={running}>
          <DropletIcon />
          {m.OPEN()}
        </button>
        <button type="button" className={button} onClick={() => set(false)} aria-pressed={!running}>
          <DropletOffIcon />
          {m.CLOSE()}
        </button>
      </div>
      {timed && (
        <div className="flex gap-2">
          {WATER_MINUTES.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={button}
              aria-label={m.WATER_OPEN_FOR({ minutes: String(minutes) })}
              onClick={() => openFor(minutes)}
            >
              <TimerIcon />
              {m.WATER_OPEN_FOR_SHORT({ minutes: String(minutes) })}
            </button>
          ))}
        </div>
      )}
    </ActuatorTile>
  );
};

// --- Water meter of the WSM (flow_meter_transmitter.fn): current flow,
// since the valve opened, in total

export const FlowMeterControl = ({ channel }: { channel: Channel }) => {
  const dp = datapoints(channel);
  const flowUnit = useUnit(channel, 'WATER_FLOW', 'l/h');
  const volumeUnit = useUnit(channel, 'WATER_VOLUME', 'l');
  const flow = measured(dp, 'WATER_FLOW');
  const sinceOpen = number(dp.WATER_VOLUME_SINCE_OPEN);
  const total = number(dp.WATER_VOLUME);
  const extras: ReactNode[] = [];
  if (sinceOpen !== undefined)
    extras.push(
      <Extra
        key="open"
        icon={<TimerIcon />}
        label={m.WATER_VOLUME_SINCE_OPEN()}
        value={`${format(sinceOpen)} ${volumeUnit}`}
      />,
    );
  if (total !== undefined)
    extras.push(
      <Extra
        key="total"
        icon={<SigmaIcon />}
        label={m.WATER_VOLUME_TOTAL()}
        value={`${format(total)} ${volumeUnit}`}
      />,
    );
  return (
    <MeasureTile
      channel={channel}
      label={m.WATER_FLOW()}
      caption={m.WATER_FLOW()}
      value={flow !== undefined ? format(flow) : '–'}
      unit={flowUnit}
      extras={extras}
    />
  );
};

// --- Water safety system (HmIP-WSS): flow, pressure and the shut-off valve

export const WaterFlowControl = ({ channel }: { channel: Channel }) => {
  const unit = useUnit(channel, 'WATER_FLOW', 'l/min');
  const flow = measured(datapoints(channel), 'WATER_FLOW');
  return (
    <MeasureTile
      channel={channel}
      label={m.WATER_FLOW()}
      caption={m.WATER_FLOW()}
      value={flow !== undefined ? format(flow) : '–'}
      unit={unit}
    />
  );
};

export const WaterPressureControl = ({ channel }: { channel: Channel }) => {
  const unit = useUnit(channel, 'WATER_PRESSURE', 'bar');
  const pressure = measured(datapoints(channel), 'WATER_PRESSURE');
  return (
    <MeasureTile
      channel={channel}
      label={m.WATER_PRESSURE()}
      caption={m.WATER_PRESSURE()}
      value={pressure !== undefined ? format(pressure, 2) : '–'}
      unit={unit}
    />
  );
};

const percentOpen = (level: number) => Math.round(level * 100);

export const ValveControl = ({ channel }: { channel: Channel }) => {
  const setDataPoint = useSetDataPoint();
  const level = number(datapoints(channel).LEVEL);
  const open = level !== undefined && level > 0;
  const status =
    level === undefined
      ? m.WINDOW_UNKNOWN()
      : level >= 1
        ? m.VALVE_OPEN()
        : level <= 0
          ? m.VALVE_CLOSED()
          : m.VALVE_PARTLY({ percent: String(percentOpen(level)) });
  const set = (value: number) => setDataPoint(channel.interfaceName, channel.address, 'LEVEL', value);
  return (
    <ActuatorTile channel={channel} status={status} active={open} icon={<WavesIcon />}>
      <div className="flex gap-2">
        <button type="button" className={button} onClick={() => set(1)}>
          <DropletIcon />
          {m.OPEN()}
        </button>
        <button type="button" className={button} onClick={() => set(0)}>
          <DropletOffIcon />
          {m.CLOSE()}
        </button>
      </div>
    </ActuatorTile>
  );
};

// --- Window drives

// HmIP-MOD-WD-VK, as win_sc_sensor.fn CreateWindowDriveReceiver: open
// (LEVEL 1), close (LEVEL 0), stop
export const WindowDriveControl = ({ channel }: { channel: Channel }) => {
  const setDataPoint = useSetDataPoint();
  const level = measured(datapoints(channel), 'LEVEL');
  const open = level !== undefined && level > 0;
  const status =
    level === undefined
      ? m.WINDOW_UNKNOWN()
      : level >= 1
        ? m.DRIVE_OPEN()
        : level <= 0
          ? m.DRIVE_CLOSED()
          : m.DRIVE_PARTLY({ percent: String(percentOpen(level)) });
  return (
    <ActuatorTile channel={channel} status={status} active={open} icon={<GaugeIcon />}>
      <DriveButtons
        channel={channel}
        onLevel={(value) => setDataPoint(channel.interfaceName, channel.address, 'LEVEL', value)}
      />
    </ActuatorTile>
  );
};

const DriveButtons = ({
  channel,
  onLevel,
  onLock,
}: {
  channel: Channel;
  onLevel: (level: number) => void;
  onLock?: () => void;
}) => {
  const setDataPoint = useSetDataPoint();
  // Two rows: the window sections are narrow
  return (
    <>
      <div className="flex gap-2">
        <button type="button" className={button} onClick={() => onLevel(1)}>
          <ArrowUpIcon />
          {m.OPEN()}
        </button>
        <button type="button" className={button} onClick={() => onLevel(0)}>
          <ArrowDownIcon />
          {m.CLOSE()}
        </button>
      </div>
      <div className="flex gap-2">
        {onLock && (
          <button type="button" className={button} onClick={onLock}>
            <LockIcon />
            {m.DRIVE_LOCK()}
          </button>
        )}
        <button
          type="button"
          className={button}
          onClick={() => setDataPoint(channel.interfaceName, channel.address, 'STOP', true)}
        >
          <SquareIcon className="fill-current !size-3.5" />
          {m.BLIND_STOP()}
        </button>
      </div>
    </>
  );
};

// BidCos Winmatic (HM-Sec-Win, rf_winmatic.xml): LEVEL 0 closed to 1 open,
// the special value -0.005 locks it (iseButtonsWinMatic in webui.js);
// STATE_UNCERTAIN while the position isn't known, ERROR for the motors
export const WINMATIC_LOCKED = -0.005;
const WINMATIC_ERRORS = ['NO_ERROR', 'MOTOR_TURN_ERROR', 'MOTOR_TILT_ERROR'];

export const winmaticState = (level: number | undefined) =>
  level === undefined ? 'unknown' : level < 0 ? 'locked' : level <= 0 ? 'closed' : level >= 1 ? 'open' : 'partly';

export const WinmaticControl = ({ channel }: { channel: Channel }) => {
  const setDataPoint = useSetDataPoint();
  const dp = datapoints(channel);
  const level = number(dp.LEVEL);
  const error = useValueList(channel, 'ERROR', WINMATIC_ERRORS).name;
  const state = winmaticState(level);
  let status: string =
    state === 'locked'
      ? m.DRIVE_LOCKED()
      : state === 'closed'
        ? m.DRIVE_CLOSED()
        : state === 'open'
          ? m.DRIVE_OPEN()
          : state === 'partly' && level !== undefined
            ? m.DRIVE_PARTLY({ percent: String(percentOpen(level)) })
            : m.WINDOW_UNKNOWN();
  if (dp.STATE_UNCERTAIN === true) status = `${status} · ${m.DRIVE_UNCERTAIN()}`;
  if (error === 'MOTOR_TURN_ERROR') status = m.DRIVE_ERROR_MOTOR_TURN_ERROR();
  if (error === 'MOTOR_TILT_ERROR') status = m.DRIVE_ERROR_MOTOR_TILT_ERROR();
  const setLevel = (value: number) => setDataPoint(channel.interfaceName, channel.address, 'LEVEL', value);
  return (
    <ActuatorTile
      channel={channel}
      status={status}
      active={state === 'open' || state === 'partly'}
      icon={state === 'locked' ? <LockIcon /> : <GaugeIcon />}
    >
      <DriveButtons channel={channel} onLevel={setLevel} onLock={() => setLevel(WINMATIC_LOCKED)} />
    </ActuatorTile>
  );
};

// The Winmatic's battery (AKKU): charge and what it is doing
const AKKU_STATUS = ['TRICKLE_CHARGE', 'CHARGE', 'DISCHARGE', 'STATE_UNKNOWN'];
const akkuLabel: Record<string, () => string> = {
  TRICKLE_CHARGE: m.AKKU_TRICKLE_CHARGE,
  CHARGE: m.AKKU_CHARGE,
  DISCHARGE: m.AKKU_DISCHARGE,
  STATE_UNKNOWN: m.AKKU_STATE_UNKNOWN,
};

export const AkkuControl = ({ channel }: { channel: Channel }) => {
  const level = number(datapoints(channel).LEVEL);
  const status = useValueList(channel, 'STATUS', AKKU_STATUS).name;
  return (
    <DetectorTile
      channel={channel}
      tone={status === 'DISCHARGE' ? 'active' : 'calm'}
      waves={false}
      icon={<BatteryIcon />}
      status={level !== undefined ? `${m.AKKU()} ${percentOpen(level)} %` : m.AKKU()}
      detail={status ? akkuLabel[status]?.() : undefined}
    />
  );
};
