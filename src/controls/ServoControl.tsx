import { useState } from 'react';
import GaugeIcon from '~icons/lucide/gauge';
import type { Channel, DatapointValue } from '../types/types';
import { useSetDataPoint } from '../queries';
import { m } from '../paraglide/messages';
import { DetectorTile } from './DetectorControls';
import { channelNumberOf } from '../lib/address';

// Servo controllers HmIP-WSC / ELV-SH-WSC, as the WebUI's servo.fn and
// iseHmIPServo: the virtual receivers (channels 4–6, 8–10) set the position
// from left (0 %) over neutral (50 %) to right (100 %) in 0.5 % steps, the
// first of each group also the ramp time (0–50 s, write only: remembered
// here like the WebUI's tmpRampTime). The WebUI writes both with one
// putParamset; here RAMP_TIME goes first, then LEVEL, like ON_TIME before
// STATE elsewhere. The transmitters (3, 7) report the actual position.

const datapoints = (channel: Channel) => channel.datapoints as Record<string, DatapointValue>;
const percent = (level: DatapointValue) => (typeof level === 'number' ? Math.round(level * 1000) / 10 : undefined);

// LEVEL_STATUS of the transmitter (servo.fn: 2 and 3 not shown)
const levelStatus = (status: DatapointValue) =>
  status === 1 ? m.SERVO_STATUS_UNKNOWN() : status === 4 ? m.SERVO_STATUS_ERROR() : undefined;

// Where the servo stands, in words
export const servoPosition = (value: number) =>
  value === 50 ? m.SERVO_NEUTRAL() : value < 50 ? m.SERVO_LEFT({ percent: value }) : m.SERVO_RIGHT({ percent: value });

const Slider = ({
  label,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (value: number) => void;
}) => {
  const [draft, setDraft] = useState<number | null>(null);
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={draft ?? value}
      onChange={(e) => setDraft(Number(e.target.value))}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
      className="w-full accent-sky-600"
    />
  );
};

export const ServoControl = ({ channel }: { channel: Channel }) => {
  const setDataPoint = useSetDataPoint();
  const dp = datapoints(channel);
  const value = percent(dp.LEVEL);
  const transmitter = channel.type === 'SERVO_TRANSMITTER';
  const [ramp, setRamp] = useState(0);
  const hasRamp = !transmitter && (channelNumberOf(channel.address) === 4 || channelNumberOf(channel.address) === 8);
  const problem = transmitter
    ? dp.ERROR_RESTART_NEEDED === true
      ? m.SERVO_RESTART_NEEDED()
      : levelStatus(dp.LEVEL_STATUS)
    : undefined;

  const move = (next: number) => {
    if (hasRamp) setDataPoint(channel.interfaceName, channel.address, 'RAMP_TIME', ramp);
    setDataPoint(channel.interfaceName, channel.address, 'LEVEL', next / 100);
  };

  return (
    <DetectorTile
      channel={channel}
      tone={problem ? 'alarm' : 'calm'}
      waves={false}
      icon={<GaugeIcon />}
      status={value === undefined ? m.WINDOW_UNKNOWN() : servoPosition(value)}
      detail={problem}
    >
      {!transmitter && (
        <div className="flex flex-col gap-1">
          <Slider
            label={`${m.SERVO_POSITION()}: ${channel.name}`}
            value={value ?? 50}
            min={0}
            max={100}
            step={0.5}
            onCommit={move}
          />
          <div className="flex justify-between text-[11px] text-muted-foreground" aria-hidden>
            <span>{m.SERVO_L()}</span>
            <span>{m.SERVO_N()}</span>
            <span>{m.SERVO_R()}</span>
          </div>
        </div>
      )}
      {hasRamp && (
        <div className="flex flex-col gap-1 text-[13px] text-muted-foreground">
          <span className="flex justify-between">
            {m.SERVO_RAMP()}
            <span className="tabular-nums">{ramp} s</span>
          </span>
          <Slider
            label={`${m.SERVO_RAMP()}: ${channel.name}`}
            value={ramp}
            min={0}
            max={50}
            step={1}
            onCommit={setRamp}
          />
        </div>
      )}
    </DetectorTile>
  );
};
