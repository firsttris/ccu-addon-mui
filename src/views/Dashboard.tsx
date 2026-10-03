import { ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import ThermometerIcon from '~icons/lucide/thermometer';
import LightbulbIcon from '~icons/lucide/lightbulb';
import AppWindowIcon from '~icons/lucide/app-window';
import { Channel, ChannelType, HeatingClimateControlTransceiverChannel } from '../types/types';
import { controlOverrides, SectionId } from '../controls/registry';
import { ControlComponent } from '../components/ControlComponent';
import { windowState } from '../controls/WindowControl';
import { useEffects } from '../contexts/EffectsContext';
import { TranslationKey, useTranslations } from '../i18n/utils';
import { getLocale } from '../paraglide/runtime';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';

// --- Tabs of rooms or trades, with a marker that glides to the active one

interface NavTabsProps {
  label: string;
  items: { id: number; name: string }[];
  activeId: string;
  to: '/room/$roomId' | '/trade/$tradeId';
}

export const NavTabs = ({ label, items, activeId, to }: NavTabsProps) => {
  const effects = useEffects();
  const listRef = useRef<HTMLDivElement>(null);
  const [marker, setMarker] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const active = listRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
      setMarker(active ? { left: active.offsetLeft, width: active.offsetWidth } : null);
      // Only the tab row scrolls sideways, never the page
      const row = listRef.current?.parentElement;
      // (from the tab's position alone, so it ends up the same however
      // often this runs)
      if (active && row) {
        const right = active.offsetLeft + active.offsetWidth;
        row.scrollLeft = right > row.clientWidth ? right - row.clientWidth + 8 : 0;
      }
    };
    update();
    // Tab widths change when the font has loaded or the window is resized
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    if (listRef.current) observer?.observe(listRef.current);
    let active = true;
    document.fonts?.ready.then(() => active && update());
    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [activeId, items]);

  if (items.length < 2) {
    return null;
  }
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      <div ref={listRef} className="tile-edge relative flex w-max min-w-full gap-1 rounded-xl border bg-card p-1">
        {marker && (
          <div
            aria-hidden
            className="absolute top-1 bottom-1 rounded-lg bg-primary transition-[left,width] duration-400 ease-[cubic-bezier(.3,.8,.2,1)]"
            style={{
              left: marker.left,
              width: marker.width,
              boxShadow: effects.on ? `0 0 ${18 * effects.k}px rgba(250,250,250,${Math.min(1, 0.14 * effects.k)})` : undefined,
            }}
          />
        )}
        {items.map((item) => {
          const active = String(item.id) === activeId;
          return (
            <Link
              key={item.id}
              to={to}
              params={to === '/room/$roomId' ? { roomId: String(item.id) } : { tradeId: String(item.id) }}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'press relative flex h-11 flex-1 items-center justify-center rounded-lg px-4 text-[15px] font-medium whitespace-nowrap',
                active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

// --- Overview: a few figures across the shown channels

const windowTypes = new Set([
  'SHUTTER_CONTACT',
  'SHUTTER_CONTACT_TRANSCEIVER',
  'ROTARY_HANDLE_SENSOR',
  'ROTARY_HANDLE_TRANSCEIVER',
]);

const isOpenWindow = (channel: Channel) =>
  windowTypes.has(channel.type) && ['open', 'tilted'].includes(windowState(channel));

// Switches and dimmers of the "lights" section, on when STATE or LEVEL say so
const isLight = (channel: Channel) => controlOverrides[channel.type]?.section === 'lights';
const isLightOn = (channel: Channel) => {
  if (!isLight(channel)) return false;
  const dp = channel.datapoints as Record<string, unknown>;
  return dp.STATE === true || (typeof dp.LEVEL === 'number' && dp.LEVEL > 0) || Number(dp.LEVEL) > 0;
};

const Stat = ({ icon, tint, label, value }: { icon: ReactNode; tint: string; label: string; value: string }) => (
  <div className="tile-edge flex min-w-0 items-center gap-3 rounded-2xl border bg-card p-4">
    <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5', tint)}>{icon}</div>
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="truncate text-xl font-semibold">{value}</div>
    </div>
  </div>
);

const Overview = ({ channels }: { channels: Channel[] }) => {
  const reachable = channels.filter((c) => !c.status?.UNREACH);
  const temperatures = reachable
    .filter((c): c is HeatingClimateControlTransceiverChannel => c.type === ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER)
    .map((c) => c.datapoints.ACTUAL_TEMPERATURE)
    .filter((t) => typeof t === 'number');
  const switches = channels.filter(isLight);
  const switchedOn = switches.filter(isLightOn).length;
  const windowChannels = channels.filter((c) => windowTypes.has(c.type));
  const openWindows = windowChannels.filter(isOpenWindow);

  const stats: ReactNode[] = [];
  if (temperatures.length > 0) {
    const average = temperatures.reduce((a, b) => a + b, 0) / temperatures.length;
    stats.push(
      <Stat
        key="temp"
        icon={<ThermometerIcon />}
        tint="bg-sky-500/12 text-sky-600 dark:text-sky-300"
        label={m.INDOOR_AVERAGE()}
        value={`${new Intl.NumberFormat(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(average)} °C`}
      />,
    );
  }
  if (switches.length > 0) {
    stats.push(
      <Stat
        key="lights"
        icon={<LightbulbIcon />}
        tint="bg-amber-500/12 text-amber-600 dark:text-amber-300"
        label={m.LIGHTS_ON()}
        value={m.COUNT_OF({ count: switchedOn, total: switches.length })}
      />,
    );
  }
  if (windowChannels.length > 0) {
    stats.push(
      <Stat
        key="windows"
        icon={<AppWindowIcon />}
        tint="bg-blue-500/12 text-blue-600 dark:text-blue-300"
        label={m.WINDOWS_OPEN()}
        value={
          openWindows.length === 0
            ? m.NONE()
            : openWindows.length <= 2
              ? openWindows.map((c) => c.name).join(', ')
              : String(openWindows.length)
        }
      />,
    );
  }
  if (stats.length === 0) {
    return null;
  }
  return <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">{stats}</section>;
};

// --- Sections: one per kind of control

const sectionTitles: Record<SectionId, () => string> = {
  climate: m.SECTION_CLIMATE,
  floor: m.SECTION_FLOOR,
  lights: m.SECTION_LIGHTS,
  blinds: m.SECTION_BLINDS,
  windows: m.SECTION_WINDOWS,
  doors: m.SECTION_DOORS,
  sensors: m.SECTION_SENSORS,
  buttons: m.SECTION_BUTTONS,
  energy: m.SECTION_ENERGY,
};

const sectionGrids: Record<SectionId | 'generic', string> = {
  climate: '[grid-template-columns:repeat(auto-fill,minmax(232px,1fr))]',
  floor: '[grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]',
  lights: 'items-start [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]',
  blinds: '[grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]',
  windows: '[grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]',
  doors: '[grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]',
  sensors: '[grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]',
  buttons: '[grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]',
  energy: '[grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]',
  generic: '[grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]',
};

// Groups channels by device (the address before ":"), in order of appearance
const groupByDevice = (channels: Channel[]) => {
  const devices = new Map<string, Channel[]>();
  for (const channel of channels) {
    const deviceAddress = channel.address.split(':')[0];
    devices.set(deviceAddress, [...(devices.get(deviceAddress) ?? []), channel]);
  }
  return Array.from(devices);
};

// A section: all types of one kind (e.g. KeyMatic and door lock drive under
// "Doors"), or a single type without its own control
interface SectionGroup {
  key: string;
  section?: SectionId;
  types: [string, Channel[]][];
}

// Sections in the order of SectionId (sectionTitles), then the types
// without a control in the order they came
export const groupIntoSections = (channelsByType: [string, Channel[]][]): SectionGroup[] => {
  const groups = new Map<string, SectionGroup>();
  for (const [type, channels] of channelsByType) {
    const section = controlOverrides[type]?.section;
    const key = section ?? `type:${type}`;
    const group = groups.get(key) ?? { key, section, types: [] };
    group.types.push([type, channels]);
    groups.set(key, group);
  }
  const order = Object.keys(sectionTitles);
  return Array.from(groups.values()).sort(
    (a, b) =>
      (a.section ? order.indexOf(a.section) : order.length) - (b.section ? order.indexOf(b.section) : order.length),
  );
};

const Section = ({ group }: { group: SectionGroup }) => {
  const t = useTranslations();
  // Types without a translation (shown by GenericControl) keep the CCU's name
  const title = group.section ? sectionTitles[group.section]() : t(group.types[0][0] as TranslationKey);
  const id = `section-${group.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const count = group.types.reduce((sum, [, channels]) => sum + channels.length, 0);
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h2 id={id} className="text-[19px] font-semibold tracking-tight">
          {title}
        </h2>
        <span className="text-sm text-muted-foreground">{count}</span>
      </div>
      <div className={cn('grid gap-3', sectionGrids[group.section ?? 'generic'])}>
        {group.types.map(([type, channels]) => {
          const override = controlOverrides[type];
          return override?.per === 'device'
            ? groupByDevice(channels).map(([deviceAddress, deviceChannels]) => (
                <override.component key={deviceAddress} channels={deviceChannels} />
              ))
            : channels.map((channel) => <ControlComponent key={channel.address} channel={channel} />);
        })}
      </div>
    </section>
  );
};

// --- The page

interface DashboardProps {
  tabs?: ReactNode;
  channelsByType: [string, Channel[]][];
  isLoading?: boolean;
}

export const Dashboard = ({ tabs, channelsByType, isLoading }: DashboardProps) => {
  const effects = useEffects();
  const channels = useMemo(() => channelsByType.flatMap(([, list]) => list), [channelsByType]);
  const lightsOn = channels.filter(isLightOn).length;
  const a = (alpha: number) => Math.min(1, alpha * effects.k).toFixed(3);

  return (
    <div className="relative mx-auto flex max-w-[1400px] flex-col gap-6 px-4 pt-2 pb-10 sm:px-6">
      {/* Ambient light in the dark: warmer the more lights are on */}
      {effects.on && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 hidden transition-[background] duration-1000 dark:block"
          style={{
            background: [
              `radial-gradient(700px 420px at 90% -6%, rgba(251,146,60,${a(0.09)}), transparent 70%)`,
              `radial-gradient(640px 520px at -10% 38%, rgba(56,189,248,${a(0.06)}), transparent 70%)`,
              `radial-gradient(700px 560px at 100% 72%, rgba(251,191,36,${a(0.015 + 0.02 * Math.min(lightsOn, 6))}), transparent 70%)`,
            ].join(', '),
          }}
        />
      )}
      {tabs}
      <Overview channels={channels} />
      {groupIntoSections(channelsByType).map((group) => (
        <Section key={group.key} group={group} />
      ))}
      {!isLoading && channelsByType.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">{m.NO_CHANNELS()}</p>
      )}
    </div>
  );
};
