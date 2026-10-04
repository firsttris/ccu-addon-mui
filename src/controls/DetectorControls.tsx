import { ReactNode, useEffect, useRef, useState } from 'react';
import FlameIcon from '~icons/lucide/flame';
import ShieldCheckIcon from '~icons/lucide/shield-check';
import DropletIcon from '~icons/lucide/droplet';
import FlaskIcon from '~icons/lucide/flask-conical';
import SunDimIcon from '~icons/lucide/sun-dim';
import RadarIcon from '~icons/lucide/radar';
import SirenIcon from '~icons/lucide/siren';
import PersonIcon from '~icons/lucide/person-standing';
import { Channel, DatapointValue } from '../types/types';
import { useSetDataPoint } from '../queries';
import { Tile } from '../components/Tile';
import { HoldButton } from '../components/Gestures';
import { Switch } from '../components/ui/switch';
import { useEffects } from '../contexts/EffectsContext';
import { getLocale } from '../paraglide/runtime';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';
import { useValueList } from './useValueList';

export type Tone = 'calm' | 'active' | 'alarm';

const toneRgb: Record<Tone, string> = { calm: '34,197,94', active: '56,189,248', alarm: '239,68,68' };
const toneText: Record<Tone, string> = {
  calm: 'text-green-700 dark:text-green-300',
  active: 'text-sky-700 dark:text-sky-300',
  alarm: 'text-red-600 dark:text-red-400',
};

// A round emblem with waves spreading from it while something happens
const Emblem = ({ tone, waves, children }: { tone: Tone; waves: boolean; children: ReactNode }) => {
  const effects = useEffects();
  const rgb = toneRgb[tone];
  return (
    <div className="relative flex size-14 shrink-0 items-center justify-center">
      {effects.on &&
        waves &&
        [0, 0.6, 1.2].map((delay) => (
          <span
            key={delay}
            aria-hidden
            className="fx-wave absolute inset-0 rounded-full border-2"
            style={{ borderColor: `rgba(${rgb},0.55)`, animationDelay: `${delay}s` }}
          />
        ))}
      <div
        className={cn('relative flex size-12 items-center justify-center rounded-full border [&_svg]:size-6', toneText[tone])}
        style={{
          background: `rgba(${rgb},0.12)`,
          borderColor: `rgba(${rgb},0.35)`,
          boxShadow: effects.on && tone !== 'calm' ? `0 0 ${18 * effects.k}px rgba(${rgb},${Math.min(1, 0.45 * effects.k)})` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export const DetectorTile = ({
  channel,
  tone,
  waves,
  icon,
  status,
  detail,
  children,
}: {
  channel: Channel;
  tone: Tone;
  waves: boolean;
  icon: ReactNode;
  status: string;
  detail?: ReactNode;
  children?: ReactNode;
}) => {
  const effects = useEffects();
  const alarm = tone === 'alarm';
  return (
    <Tile
      status={channel.status}
      role="group"
      aria-label={channel.name}
      lit={alarm}
      className={cn(alarm && 'border-red-500/50', alarm && effects.on && 'fx-alarm')}
      style={
        tone !== 'calm' && effects.on
          ? { background: `radial-gradient(80% 90% at 0% 30%, rgba(${toneRgb[tone]},${Math.min(1, (alarm ? 0.2 : 0.1) * effects.k)}), transparent 70%), var(--card)` }
          : undefined
      }
    >
      <div className="flex flex-col gap-3 p-3.5">
        <div className="flex items-center gap-3">
          <Emblem tone={tone} waves={waves}>
            {icon}
          </Emblem>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="line-clamp-2 text-[15px] leading-snug font-medium" title={channel.name}>
              {channel.name}
            </span>
            <span role="status" className={cn('text-[13px] font-medium', alarm ? toneText.alarm : tone === 'active' ? toneText.active : 'text-muted-foreground')}>
              {status}
            </span>
            {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
          </div>
        </div>
        {children}
      </div>
    </Tile>
  );
};

// --- Smoke detectors

const ALARM_STATUS = ['IDLE_OFF', 'PRIMARY_ALARM', 'INTRUSION_ALARM', 'SECONDARY_ALARM'];
const TEST_RESULT = ['NONE', 'SMOKE_TEST_OK', 'SMOKE_TEST_FAILED', 'COMMUNICATION_TEST_SENT', 'COMMUNICATION_TEST_OK'];
const COMMANDS = ['RESERVED_ALARM_OFF', 'INTRUSION_ALARM_OFF', 'INTRUSION_ALARM', 'SMOKE_TEST', 'COMMUNICATION_TEST', 'COMMUNICATION_TEST_REPEATED'];

// HmIP-SWSD (SMOKE_DETECTOR_ALARM_STATUS) and BidCos smoke detectors
// (STATE): calm green, red and pulsing on alarm. The smoke test sounds the
// siren, so it has to be held.
export const SmokeDetectorControl = ({ channel }: { channel: Channel }) => {
  const setDataPoint = useSetDataPoint();
  const dp = channel.datapoints as Record<string, DatapointValue>;
  const status = useValueList(channel, 'SMOKE_DETECTOR_ALARM_STATUS', ALARM_STATUS);
  const result = useValueList(channel, 'SMOKE_DETECTOR_TEST_RESULT', TEST_RESULT);
  const command = useValueList(channel, 'SMOKE_DETECTOR_COMMAND', COMMANDS);
  const hmip = 'SMOKE_DETECTOR_ALARM_STATUS' in dp;
  const alarm = hmip ? status.name !== undefined && status.name !== 'IDLE_OFF' : dp.STATE === true;
  const text = !alarm
    ? m.SMOKE_CALM()
    : status.name === 'INTRUSION_ALARM'
      ? m.SMOKE_INTRUSION()
      : status.name === 'SECONDARY_ALARM'
        ? m.SMOKE_SECONDARY()
        : m.SMOKE_ALARM();
  const resultText =
    result.name === 'SMOKE_TEST_OK'
      ? m.SMOKE_TEST_OK()
      : result.name === 'SMOKE_TEST_FAILED'
        ? m.SMOKE_TEST_FAILED()
        : undefined;
  const testIndex = command.indexOf('SMOKE_TEST');
  return (
    <DetectorTile
      channel={channel}
      tone={alarm ? 'alarm' : 'calm'}
      waves={alarm}
      icon={alarm ? <FlameIcon /> : <ShieldCheckIcon />}
      status={text}
      detail={resultText}
    >
      {command.known && testIndex >= 0 && !alarm && (
        <HoldButton
          label={m.SMOKE_TEST()}
          hint={m.SMOKE_TEST_HINT()}
          icon={<FlaskIcon />}
          tone="text-red-500"
          onConfirm={() => setDataPoint(channel.interfaceName, channel.address, 'SMOKE_DETECTOR_COMMAND', testIndex)}
        />
      )}
    </DetectorTile>
  );
};

// --- Motion and presence

const minutesAgo = (since: number) => Math.max(0, Math.round((Date.now() - since) / 60000));

// Motion (BidCos MOTION_DETECTOR, HmIP MOTIONDETECTOR_TRANSCEIVER) and
// presence detectors (PRESENCEDETECTOR_TRANSCEIVER): radar waves while something moves, the
// last movement since the app is open, the brightness they measure, and
// detection on or off where the device allows it.
export const MotionDetectorControl = ({ channel }: { channel: Channel }) => {
  const setDataPoint = useSetDataPoint();
  const dp = channel.datapoints as Record<string, DatapointValue>;
  const presence = 'PRESENCE_DETECTION_STATE' in dp;
  const detected = presence ? dp.PRESENCE_DETECTION_STATE === true : dp.MOTION === true;
  const activeKey = presence ? 'PRESENCE_DETECTION_ACTIVE' : 'MOTION_DETECTION_ACTIVE';
  const active = dp[activeKey];
  // HmIP: CURRENT_ILLUMINATION is the moment's value, ILLUMINATION an average
  const lux = typeof dp.CURRENT_ILLUMINATION === 'number' ? dp.CURRENT_ILLUMINATION : dp.ILLUMINATION;
  const illumination = typeof lux === 'number' ? lux : typeof dp.BRIGHTNESS === 'number' ? dp.BRIGHTNESS : undefined;
  const [last, setLast] = useState<number | null>(null);
  const [, tick] = useState(0);
  const was = useRef(detected);
  useEffect(() => {
    if (was.current && !detected) setLast(Date.now());
    was.current = detected;
  }, [detected]);
  useEffect(() => {
    if (last === null) return;
    const timer = setInterval(() => tick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, [last]);

  const status = active === false ? m.DETECTION_OFF() : detected ? (presence ? m.PRESENCE_NOW() : m.MOTION_NOW()) : presence ? m.NO_PRESENCE() : m.NO_MOTION();
  const detail =
    !detected && last !== null ? (minutesAgo(last) === 0 ? m.MOTION_JUST_NOW() : m.MOTION_MINUTES_AGO({ minutes: minutesAgo(last) })) : undefined;
  return (
    <DetectorTile
      channel={channel}
      tone={detected && active !== false ? 'active' : 'calm'}
      waves={detected && active !== false}
      icon={presence ? <PersonIcon /> : <RadarIcon />}
      status={status}
      detail={detail}
    >
      {(illumination !== undefined || typeof active === 'boolean') && (
        <div className="flex items-center justify-between gap-2 text-[13px]">
          {illumination !== undefined ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <SunDimIcon className="size-4" aria-hidden />
              {new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 0 }).format(illumination)} {typeof lux === 'number' ? 'lx' : ''}
            </span>
          ) : (
            <span />
          )}
          {typeof active === 'boolean' && (
            <label className="flex items-center gap-2 text-muted-foreground">
              {m.DETECTION()}
              <Switch
                aria-label={`${m.DETECTION()} ${channel.name}`}
                checked={active}
                onCheckedChange={(checked) => setDataPoint(channel.interfaceName, channel.address, activeKey, checked)}
              />
            </label>
          )}
        </div>
      )}
    </DetectorTile>
  );
};

// --- Water

// HmIP-SWD (WATER_DETECTION_TRANSMITTER: MOISTURE_DETECTED,
// WATERLEVEL_DETECTED) and BidCos water sensors (WATERDETECTIONSENSOR:
// STATE 0 dry, 1 wet, 2 water)
export const WaterDetectorControl = ({ channel }: { channel: Channel }) => {
  const dp = channel.datapoints as Record<string, DatapointValue>;
  const water = dp.WATERLEVEL_DETECTED === true || dp.STATE === 2 || (dp.ALARMSTATE === true && !('MOISTURE_DETECTED' in dp));
  const wet = !water && (dp.MOISTURE_DETECTED === true || dp.STATE === 1);
  return (
    <DetectorTile
      channel={channel}
      tone={water ? 'alarm' : wet ? 'active' : 'calm'}
      waves={water || wet}
      icon={<DropletIcon className={cn(water || wet ? 'fill-current' : '')} />}
      status={water ? m.WATER_DETECTED() : wet ? m.MOISTURE_DETECTED() : m.WATER_DRY()}
    />
  );
};

// --- Sirens

// HmIP-ASIR (ALARM_SWITCH_VIRTUAL_RECEIVER): whether siren or flash
// light are on. Choosing tones takes combined parameters; that stays in
// the WebUI.
export const SirenControl = ({ channel }: { channel: Channel }) => {
  const dp = channel.datapoints as Record<string, DatapointValue>;
  const acoustic = dp.ACOUSTIC_ALARM_ACTIVE === true;
  const optical = dp.OPTICAL_ALARM_ACTIVE === true;
  return (
    <DetectorTile
      channel={channel}
      tone={acoustic ? 'alarm' : optical ? 'active' : 'calm'}
      waves={acoustic || optical}
      icon={<SirenIcon />}
      status={acoustic ? m.SIREN_ACOUSTIC() : optical ? m.SIREN_OPTICAL() : m.SIREN_QUIET()}
    />
  );
};
