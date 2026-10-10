import type { ReactNode } from 'react';
import DoorClosedIcon from '~icons/lucide/door-closed';
import DoorOpenIcon from '~icons/lucide/door-open';
import LockIcon from '~icons/lucide/lock';
import LockOpenIcon from '~icons/lucide/lock-open';
import RotateCcwIcon from '~icons/lucide/rotate-ccw';
import WavesIcon from '~icons/lucide/waves';
import { type Channel, type DatapointValue, Operation } from '../types/types';
import { useParamsetDescription, useSetDataPoint } from '../queries';
import { Switch } from '../components/ui/switch';
import { Button } from '../components/ui/button';
import { m } from '../paraglide/messages';
import { DetectorTile, type Tone } from './DetectorControls';

// Side channels of devices whose main channel has its own tile: the pump
// and direct outputs of floor heating controllers, and the door state,
// auto relock and lock state of door locks.

const datapoints = (channel: Channel) => channel.datapoints as Record<string, DatapointValue>;

// Whether a datapoint may be written, from the paramset description
const useWritable = (channel: Channel, datapoint: string) => {
  const { data: description } = useParamsetDescription(channel.interfaceName, channel.address);
  return ((description?.[datapoint]?.operations ?? 0) & Operation.WRITE) !== 0;
};

const Flags = ({ flags }: { flags: { on: boolean; label: string; alarm?: boolean }[] }) => {
  const active = flags.filter((f) => f.on);
  if (active.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={m.FLOOR_FLAGS()}>
      {active.map((f) => (
        <li
          key={f.label}
          className={
            f.alarm
              ? 'rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300'
              : 'rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
          }
        >
          {f.label}
        </li>
      ))}
    </ul>
  );
};

// --- Floor heating outputs: the pump (HmIP(W)-FAL230, channel 1) and the
// direct output of wall thermostats (HmIP-BWTH, -WGT: STATE). The WebUI
// shows nothing for them (climatecontrol_floor_transceiver.fn:
// CreateClimateControlFloorPumpTransceiver is empty); here they show
// whether they run and why the controller overrides them (dew point,
// emergency operation, frost protection).
export const FloorOutputControl = ({ channel }: { channel: Channel }) => {
  const setDataPoint = useSetDataPoint();
  const dp = datapoints(channel);
  const pump = channel.type === 'CLIMATECONTROL_FLOOR_PUMP_TRANSCEIVER';
  const on = dp.STATE === true;
  const writable = useWritable(channel, 'STATE');
  const dewPoint = dp.DEW_POINT_ALARM === true || dp.HUMIDITY_ALARM === true;
  const tone: Tone = dewPoint ? 'alarm' : on ? 'active' : 'calm';
  const status =
    typeof dp.STATE !== 'boolean'
      ? m.WINDOW_UNKNOWN()
      : pump
        ? on
          ? m.PUMP_ON()
          : m.PUMP_OFF()
        : on
          ? m.ON()
          : m.OFF();
  return (
    <DetectorTile channel={channel} tone={tone} waves={on && !dewPoint} icon={<WavesIcon />} status={status}>
      <Flags
        flags={[
          { on: dp.DEW_POINT_ALARM === true, label: m.FLOOR_DEW_POINT(), alarm: true },
          { on: dp.HUMIDITY_ALARM === true, label: m.FLOOR_HUMIDITY_ALARM(), alarm: true },
          { on: dp.EMERGENCY_OPERATION === true, label: m.FLOOR_EMERGENCY(), alarm: true },
          { on: dp.FROST_PROTECTION === true, label: m.FLOOR_FROST() },
          { on: dp.HUMIDITY_LIMITER === true, label: m.FLOOR_HUMIDITY_LIMITER() },
          { on: dp.EXTERNAL_CLOCK === true, label: m.FLOOR_EXTERNAL_CLOCK() },
        ]}
      />
      {writable && (
        <label className="flex items-center justify-between gap-3 text-[13px]">
          {pump ? m.PUMP() : m.OUTPUT()}
          <Switch
            aria-label={`${pump ? m.PUMP() : m.OUTPUT()}: ${channel.name}`}
            checked={on}
            onCheckedChange={(checked) => setDataPoint(channel.interfaceName, channel.address, 'STATE', checked)}
          />
        </label>
      )}
    </DetectorTile>
  );
};

// --- Door state of the HmIP-DLP door lock drive (channel 3: STATE 0 closed,
// 1 open), with its calibration, as the WebUI's door_opener.fn
// CreateDoorStateTranseiver
export const DoorStateControl = ({ channel }: { channel: Channel }) => {
  const setDataPoint = useSetDataPoint();
  const dp = datapoints(channel);
  const state = dp.STATE;
  const open = state === 1 || state === true;
  const known = state === 0 || state === 1 || typeof state === 'boolean';
  return (
    <DetectorTile
      channel={channel}
      tone={open ? 'active' : 'calm'}
      waves={false}
      icon={open ? <DoorOpenIcon /> : <DoorClosedIcon />}
      status={!known ? m.WINDOW_UNKNOWN() : open ? m.DOOR_IS_OPEN() : m.DOOR_IS_CLOSED()}
    >
      {'CALIBRATE_DOOR_STATE' in dp && (
        <Button
          type="button"
          variant="outline"
          className="h-8 w-fit"
          onClick={() => setDataPoint(channel.interfaceName, channel.address, 'CALIBRATE_DOOR_STATE', true)}
        >
          <RotateCcwIcon />
          {m.DOOR_CALIBRATE()}
        </Button>
      )}
    </DetectorTile>
  );
};

// --- Lock state reported by the HmIP-DLS lock sensor (LOCK_STATE 0
// unknown, 1 locked, 2 unlocked), as door_opener.fn
// CreateDoorLockStateTranseiver
export const LockStateControl = ({ channel }: { channel: Channel }) => {
  const state = datapoints(channel).LOCK_STATE;
  const locked = state === 1;
  const unlocked = state === 2;
  return (
    <DetectorTile
      channel={channel}
      tone={unlocked ? 'active' : 'calm'}
      waves={false}
      icon={unlocked ? <LockOpenIcon /> : <LockIcon />}
      status={locked ? m.LOCKED() : unlocked ? m.UNLOCKED() : m.WINDOW_UNKNOWN()}
    />
  );
};

// --- Auto relock of the HmIP-DLP (channel 13: AUTO_RELOCK_STATE), as
// door_opener.fn's buttons "Auto-Relock aus/an"
export const AutoRelockControl = ({ channel }: { channel: Channel }) => {
  const setDataPoint = useSetDataPoint();
  const on = datapoints(channel).AUTO_RELOCK_STATE === true;
  const writable = useWritable(channel, 'AUTO_RELOCK_STATE');
  const row: ReactNode = (
    <label className="flex items-center justify-between gap-3 text-[13px]">
      {m.AUTO_RELOCK()}
      <Switch
        aria-label={`${m.AUTO_RELOCK()}: ${channel.name}`}
        checked={on}
        disabled={!writable}
        onCheckedChange={(checked) =>
          setDataPoint(channel.interfaceName, channel.address, 'AUTO_RELOCK_STATE', checked)
        }
      />
    </label>
  );
  return (
    <DetectorTile
      channel={channel}
      tone={on ? 'active' : 'calm'}
      waves={false}
      icon={<LockIcon />}
      status={on ? m.AUTO_RELOCK_ON() : m.AUTO_RELOCK_OFF()}
    >
      {row}
    </DetectorTile>
  );
};
