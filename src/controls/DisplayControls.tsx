import { ComponentType, SVGProps, useState } from 'react';
import MonitorIcon from '~icons/lucide/monitor';
import SendIcon from '~icons/lucide/send';
import LightbulbOffIcon from '~icons/lucide/lightbulb-off';
import LightbulbIcon from '~icons/lucide/lightbulb';
import LockOpenIcon from '~icons/lucide/lock-open';
import LockIcon from '~icons/lucide/lock';
import XIcon from '~icons/lucide/x';
import CheckIcon from '~icons/lucide/check';
import InfoIcon from '~icons/lucide/info';
import MailIcon from '~icons/lucide/mail';
import WrenchIcon from '~icons/lucide/wrench';
import SunIcon from '~icons/lucide/sun';
import MoonIcon from '~icons/lucide/moon';
import WindIcon from '~icons/lucide/wind';
import CloudIcon from '~icons/lucide/cloud';
import CloudLightningIcon from '~icons/lucide/cloud-lightning';
import CloudDrizzleIcon from '~icons/lucide/cloud-drizzle';
import CloudMoonIcon from '~icons/lucide/cloud-moon';
import CloudRainIcon from '~icons/lucide/cloud-rain';
import CloudSnowIcon from '~icons/lucide/cloud-snow';
import CloudSunIcon from '~icons/lucide/cloud-sun';
import CloudSunRainIcon from '~icons/lucide/cloud-sun-rain';
import SnowflakeIcon from '~icons/lucide/snowflake';
import DropletIcon from '~icons/lucide/droplet';
import FlameIcon from '~icons/lucide/flame';
import AppWindowIcon from '~icons/lucide/app-window';
import BlindsIcon from '~icons/lucide/blinds';
import LeafIcon from '~icons/lucide/leaf';
import ShieldOffIcon from '~icons/lucide/shield-off';
import ShieldHalfIcon from '~icons/lucide/shield-half';
import ShieldIcon from '~icons/lucide/shield';
import BellIcon from '~icons/lucide/bell';
import ClockIcon from '~icons/lucide/clock';
import { Channel } from '../types/types';
import { useSetDataPoint } from '../queries';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { NativeSelect } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { DetectorTile } from './DetectorControls';

// Displays that the CCU writes to, as the WebUI does it: the e-paper
// display of the HmIP-WRCD (acoustic_display_receiver.fn, webui.js
// StatusDisplayDialogAcousticEPaper) and the display of the HM-RC-19
// remote control (rc19_display.fn, iseChannels.saveDisplayValues).

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

// --- HmIP-WRCD

type Align = 'LEFT' | 'CENTER' | 'RIGHT';
type Color = 'WHITE' | 'BLACK';

export interface DisplayLine {
  text: string;
  align: Align;
  background: Color;
  color: Color;
  // 0: none, 1–31 the icons of the WRCD (getIconDescr)
  icon: number;
}

export interface DisplaySound {
  // -1: none, 0–7 ACOUSTIC_NOTIFICATION_SELECTION
  selection: number;
  // 0: once, 1–14, 15: endless (REPETITIONS)
  repetitions: number;
  // 5–80 s (INTERVAL)
  interval: number;
}

export const emptyLine = (): DisplayLine => ({
  text: '',
  align: 'CENTER',
  background: 'WHITE',
  color: 'BLACK',
  icon: 0,
});

// Commas, braces and "=" would break the parameter string, quotes and
// backslashes ReGa's string literal: a comma becomes a point (21,5 → 21.5),
// the others are left out. This is the text the display shows.
export const cleanDisplayText = (text: string) => text.replace(/,/g, '.').replace(/[{}="\\\r\n]/g, '');

// The display knows a limited character set; the WebUI maps umlauts and
// some signs to codes (_encodeSpecialChars)
export const encodeDisplayText = (text: string) =>
  cleanDisplayText(text)
    .replace(/Ä/g, '[')
    .replace(/Ö/g, '#')
    .replace(/Ü/g, '$')
    .replace(/ä/g, '²')
    .replace(/ö/g, '|')
    .replace(/ü/g, '³')
    .replace(/ß/g, '_')
    .replace(/&/g, ']')
    .replace(/'/g, 'µ');

// The COMBINED_PARAMETER the WebUI writes (_createConfigString): one block
// per used line, DISPLAY_DATA_COMMIT only on the last, then the sound;
// a reset writes "XXX" to line 1
export const displayConfigString = (lines: DisplayLine[], sound: DisplaySound, reset = false) => {
  if (reset) return '{DDS=XXX,DDID=1,DDC=true}';
  const blocks = lines.flatMap((line, index) =>
    line.text !== '' || line.icon !== 0
      ? [
          `DDBC=${line.background},DDTC=${line.color},DDI=${line.icon},DDA=${line.align},DDS=${encodeDisplayText(line.text)},DDID=${index + 1}`,
        ]
      : [],
  );
  const text = blocks.map((block, index) => `{${block}${index === blocks.length - 1 ? ',DDC=true' : ''}}`);
  if (sound.selection >= 0) text.push(`{R=${sound.repetitions},IN=${sound.interval},ANS=${sound.selection}}`);
  return text.join(',');
};

const icons: [Icon, () => string][] = [
  [LightbulbOffIcon, m.DISPLAY_ICON_1],
  [LightbulbIcon, m.DISPLAY_ICON_2],
  [LockOpenIcon, m.DISPLAY_ICON_3],
  [LockIcon, m.DISPLAY_ICON_4],
  [XIcon, m.DISPLAY_ICON_5],
  [CheckIcon, m.DISPLAY_ICON_6],
  [InfoIcon, m.DISPLAY_ICON_7],
  [MailIcon, m.DISPLAY_ICON_8],
  [WrenchIcon, m.DISPLAY_ICON_9],
  [SunIcon, m.DISPLAY_ICON_10],
  [MoonIcon, m.DISPLAY_ICON_11],
  [WindIcon, m.DISPLAY_ICON_12],
  [CloudIcon, m.DISPLAY_ICON_13],
  [CloudLightningIcon, m.DISPLAY_ICON_14],
  [CloudDrizzleIcon, m.DISPLAY_ICON_15],
  [CloudMoonIcon, m.DISPLAY_ICON_16],
  [CloudRainIcon, m.DISPLAY_ICON_17],
  [CloudSnowIcon, m.DISPLAY_ICON_18],
  [CloudSunIcon, m.DISPLAY_ICON_19],
  [CloudSunRainIcon, m.DISPLAY_ICON_20],
  [SnowflakeIcon, m.DISPLAY_ICON_21],
  [DropletIcon, m.DISPLAY_ICON_22],
  [FlameIcon, m.DISPLAY_ICON_23],
  [AppWindowIcon, m.DISPLAY_ICON_24],
  [BlindsIcon, m.DISPLAY_ICON_25],
  [LeafIcon, m.DISPLAY_ICON_26],
  [ShieldOffIcon, m.DISPLAY_ICON_27],
  [ShieldHalfIcon, m.DISPLAY_ICON_28],
  [ShieldIcon, m.DISPLAY_ICON_29],
  [BellIcon, m.DISPLAY_ICON_30],
  [ClockIcon, m.DISPLAY_ICON_31],
];

const sounds = [
  m.DISPLAY_SOUND_0,
  m.DISPLAY_SOUND_1,
  m.DISPLAY_SOUND_2,
  m.DISPLAY_SOUND_3,
  m.DISPLAY_SOUND_4,
  m.DISPLAY_SOUND_5,
  m.DISPLAY_SOUND_6,
  m.DISPLAY_SOUND_7,
];

const field = 'flex flex-col gap-1 text-xs text-muted-foreground';

// How the e-paper display will look
const Preview = ({ lines }: { lines: DisplayLine[] }) => (
  <div
    role="img"
    aria-label={m.DISPLAY_PREVIEW()}
    className="mx-auto flex w-full max-w-60 flex-col overflow-hidden rounded-lg border-4 border-neutral-300 bg-white dark:border-neutral-600"
  >
    {lines.map((line, index) => {
      const IconComponent = line.icon > 0 ? icons[line.icon - 1]?.[0] : undefined;
      return (
        <div
          key={index}
          className={cn(
            'flex h-8 items-center gap-1.5 px-2 text-sm font-semibold',
            line.background === 'BLACK' ? 'bg-black' : 'bg-white',
            line.color === 'WHITE' ? 'text-white' : 'text-black',
            line.align === 'LEFT' ? 'justify-start' : line.align === 'RIGHT' ? 'justify-end' : 'justify-center',
          )}
        >
          {IconComponent && <IconComponent className="size-4 shrink-0" />}
          <span className="truncate">{cleanDisplayText(line.text)}</span>
        </div>
      );
    })}
  </div>
);

const LineEditor = ({
  index,
  line,
  onChange,
}: {
  index: number;
  line: DisplayLine;
  onChange: (line: DisplayLine) => void;
}) => {
  const label = m.DISPLAY_LINE({ line: index + 1 });
  return (
    <fieldset className="grid grid-cols-2 gap-2 rounded-xl border p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <label className={cn(field, 'col-span-2')}>
        {m.DISPLAY_TEXT()}
        <Input
          aria-label={`${m.DISPLAY_TEXT()}: ${label}`}
          value={line.text}
          maxLength={15}
          onChange={(e) => onChange({ ...line, text: e.target.value })}
        />
      </label>
      <label className={field}>
        {m.DISPLAY_ALIGN()}
        <NativeSelect
          aria-label={`${m.DISPLAY_ALIGN()}: ${label}`}
          value={line.align}
          onChange={(e) => onChange({ ...line, align: e.target.value as Align })}
        >
          <option value="LEFT">{m.DISPLAY_ALIGN_LEFT()}</option>
          <option value="CENTER">{m.DISPLAY_ALIGN_CENTER()}</option>
          <option value="RIGHT">{m.DISPLAY_ALIGN_RIGHT()}</option>
        </NativeSelect>
      </label>
      <label className={field}>
        {m.DISPLAY_BACKGROUND()}
        <NativeSelect
          aria-label={`${m.DISPLAY_BACKGROUND()}: ${label}`}
          value={line.background}
          onChange={(e) => onChange({ ...line, background: e.target.value as Color })}
        >
          <option value="WHITE">{m.DISPLAY_WHITE()}</option>
          <option value="BLACK">{m.DISPLAY_BLACK()}</option>
        </NativeSelect>
      </label>
      <label className={field}>
        {m.DISPLAY_TEXT_COLOR()}
        <NativeSelect
          aria-label={`${m.DISPLAY_TEXT_COLOR()}: ${label}`}
          value={line.color}
          onChange={(e) => onChange({ ...line, color: e.target.value as Color })}
        >
          <option value="WHITE">{m.DISPLAY_WHITE()}</option>
          <option value="BLACK">{m.DISPLAY_BLACK()}</option>
        </NativeSelect>
      </label>
      <label className={field}>
        {m.DISPLAY_ICON()}
        <NativeSelect
          aria-label={`${m.DISPLAY_ICON()}: ${label}`}
          value={line.icon}
          onChange={(e) => onChange({ ...line, icon: Number(e.target.value) })}
        >
          <option value={0}>{m.DISPLAY_NOT_USED()}</option>
          {icons.map(([, name], i) => (
            <option key={i} value={i + 1}>
              {name()}
            </option>
          ))}
        </NativeSelect>
      </label>
    </fieldset>
  );
};

const DisplaySheet = ({
  channel,
  open,
  onOpenChange,
}: {
  channel: Channel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const setDataPoint = useSetDataPoint();
  const [lines, setLines] = useState<DisplayLine[]>(() => Array.from({ length: 5 }, emptyLine));
  const [sound, setSound] = useState<DisplaySound>({ selection: -1, repetitions: 0, interval: 5 });
  const [reset, setReset] = useState(false);
  const config = displayConfigString(lines, sound, reset);

  const send = () => {
    if (config === '') return;
    setDataPoint(channel.interfaceName, channel.address, 'COMBINED_PARAMETER', config);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pr-12">
          <SheetTitle className="text-lg">{m.DISPLAY_CONFIGURE()}</SheetTitle>
          <SheetDescription>{channel.name}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          {!reset && (
            <>
              <Preview lines={lines} />
              <p className="text-xs text-muted-foreground">{m.DISPLAY_HINT()}</p>
              {lines.map((line, index) => (
                <LineEditor
                  key={index}
                  index={index}
                  line={line}
                  onChange={(next) => setLines(lines.map((l, i) => (i === index ? next : l)))}
                />
              ))}
              <fieldset className="grid grid-cols-1 gap-2 rounded-xl border p-3 sm:grid-cols-3">
                <legend className="px-1 text-sm font-medium">{m.DISPLAY_SOUND()}</legend>
                <label className={field}>
                  {m.DISPLAY_SOUND()}
                  <NativeSelect
                    aria-label={m.DISPLAY_SOUND()}
                    value={sound.selection}
                    onChange={(e) => setSound({ ...sound, selection: Number(e.target.value) })}
                  >
                    <option value={-1}>{m.DISPLAY_NOT_USED()}</option>
                    {sounds.map((name, i) => (
                      <option key={i} value={i}>
                        {name()}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                {sound.selection >= 0 && (
                  <>
                    <label className={field}>
                      {m.DISPLAY_REPETITIONS()}
                      <NativeSelect
                        aria-label={m.DISPLAY_REPETITIONS()}
                        value={sound.repetitions}
                        onChange={(e) => setSound({ ...sound, repetitions: Number(e.target.value) })}
                      >
                        <option value={0}>{m.DISPLAY_NO_REPETITION()}</option>
                        {Array.from({ length: 14 }, (_, i) => (
                          <option key={i} value={i + 1}>
                            {i + 1}
                          </option>
                        ))}
                        <option value={15}>{m.DISPLAY_INFINITE()}</option>
                      </NativeSelect>
                    </label>
                    <label className={field}>
                      {m.DISPLAY_INTERVAL()}
                      <NativeSelect
                        aria-label={m.DISPLAY_INTERVAL()}
                        value={sound.interval}
                        onChange={(e) => setSound({ ...sound, interval: Number(e.target.value) })}
                      >
                        {Array.from({ length: 16 }, (_, i) => (
                          <option key={i} value={(i + 1) * 5}>
                            {(i + 1) * 5} s
                          </option>
                        ))}
                      </NativeSelect>
                    </label>
                  </>
                )}
              </fieldset>
            </>
          )}
          <label className="flex items-center justify-between gap-3 text-sm">
            {m.DISPLAY_RESET()}
            <Switch aria-label={m.DISPLAY_RESET()} checked={reset} onCheckedChange={setReset} />
          </label>
          <Button type="button" onClick={send} disabled={config === ''}>
            <SendIcon />
            {m.DISPLAY_SEND()}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export const AcousticDisplayControl = ({ channel }: { channel: Channel }) => {
  const [open, setOpen] = useState(false);
  return (
    <DetectorTile channel={channel} tone="calm" waves={false} icon={<MonitorIcon />} status={m.DISPLAY_EPAPER_STATUS()}>
      <Button type="button" variant="outline" className="h-9 w-fit" onClick={() => setOpen(true)}>
        <MonitorIcon />
        {m.DISPLAY_CONFIGURE()}
      </Button>
      {open && <DisplaySheet channel={channel} open={open} onOpenChange={setOpen} />}
    </DetectorTile>
  );
};

// --- HM-RC-19: up to 5 characters, a unit, symbols, backlight and beep,
// set one by one and sent with SUBMIT (saveDisplayValues: TEXT, BEEP,
// UNIT, BACKLIGHT, the chosen symbols, SUBMIT)

export const rc19Symbols = [
  'BULB',
  'SWITCH',
  'WINDOW',
  'DOOR',
  'BLIND',
  'SCENE',
  'PHONE',
  'BELL',
  'CLOCK',
  'ARROW_UP',
  'ARROW_DOWN',
] as const;
type Rc19Symbol = (typeof rc19Symbols)[number];

const symbolNames: Record<Rc19Symbol, () => string> = {
  BULB: m.RC19_BULB,
  SWITCH: m.RC19_SWITCH,
  WINDOW: m.RC19_WINDOW,
  DOOR: m.RC19_DOOR,
  BLIND: m.RC19_BLIND,
  SCENE: m.RC19_SCENE,
  PHONE: m.RC19_PHONE,
  BELL: m.RC19_BELL,
  CLOCK: m.RC19_CLOCK,
  ARROW_UP: m.RC19_ARROW_UP,
  ARROW_DOWN: m.RC19_ARROW_DOWN,
};

const units = [m.DISPLAY_UNIT_NONE, () => '%', () => 'W', () => '°C', () => '°F'];
const backlights = [m.DISPLAY_BACKLIGHT_0, m.DISPLAY_BACKLIGHT_1, m.DISPLAY_BACKLIGHT_2, m.DISPLAY_BACKLIGHT_3];
const beeps = [m.DISPLAY_BEEP_0, m.DISPLAY_BEEP_1, m.DISPLAY_BEEP_2, m.DISPLAY_BEEP_3];

export interface Rc19Message {
  text: string;
  unit: number;
  backlight: number;
  beep: number;
  symbols: Rc19Symbol[];
}

// The writes in the WebUI's order, SUBMIT last
export const rc19Writes = (message: Rc19Message): [string, string | number | boolean][] => [
  ['TEXT', message.text.replace(/["\\\r\n]/g, '').slice(0, 5)],
  ['BEEP', message.beep],
  ['UNIT', message.unit],
  ['BACKLIGHT', message.backlight],
  ...rc19Symbols.filter((s) => message.symbols.includes(s)).map((s): [string, boolean] => [s, true]),
  ['SUBMIT', true],
];

export const Rc19DisplayControl = ({ channel }: { channel: Channel }) => {
  const setDataPoint = useSetDataPoint();
  const [message, setMessage] = useState<Rc19Message>({ text: '', unit: 0, backlight: 0, beep: 0, symbols: [] });
  const select = (label: string, value: number, options: (() => string)[], key: 'unit' | 'backlight' | 'beep') => (
    <label className={field}>
      {label}
      <NativeSelect
        aria-label={`${label}: ${channel.name}`}
        value={value}
        onChange={(e) => setMessage({ ...message, [key]: Number(e.target.value) })}
      >
        {options.map((name, i) => (
          <option key={i} value={i}>
            {name()}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
  const toggle = (symbol: Rc19Symbol) =>
    setMessage({
      ...message,
      symbols: message.symbols.includes(symbol)
        ? message.symbols.filter((s) => s !== symbol)
        : [...message.symbols, symbol],
    });
  const send = () => {
    for (const [datapoint, value] of rc19Writes(message)) {
      setDataPoint(channel.interfaceName, channel.address, datapoint, value);
    }
  };
  return (
    <DetectorTile channel={channel} tone="calm" waves={false} icon={<MonitorIcon />} status={m.DISPLAY_RC19_STATUS()}>
      <div className="grid grid-cols-2 gap-2">
        <label className={field}>
          {m.DISPLAY_TEXT()}
          <Input
            aria-label={`${m.DISPLAY_TEXT()}: ${channel.name}`}
            value={message.text}
            maxLength={5}
            onChange={(e) => setMessage({ ...message, text: e.target.value })}
          />
        </label>
        {select(m.DISPLAY_UNIT(), message.unit, units, 'unit')}
        {select(m.DISPLAY_BACKLIGHT(), message.backlight, backlights, 'backlight')}
        {select(m.DISPLAY_BEEP(), message.beep, beeps, 'beep')}
      </div>
      <div role="group" aria-label={m.DISPLAY_SYMBOLS()} className="flex flex-wrap gap-1.5">
        {rc19Symbols.map((symbol) => (
          <button
            key={symbol}
            type="button"
            aria-pressed={message.symbols.includes(symbol)}
            onClick={() => toggle(symbol)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs',
              message.symbols.includes(symbol)
                ? 'border-sky-500/50 bg-sky-500/15 text-sky-700 dark:text-sky-300'
                : 'text-muted-foreground',
            )}
          >
            {symbolNames[symbol]()}
          </button>
        ))}
      </div>
      <Button type="button" variant="outline" className="h-9 w-fit" onClick={send}>
        <SendIcon />
        {m.DISPLAY_SEND()}
      </Button>
    </DetectorTile>
  );
};
