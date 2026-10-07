import { PlaceDiagrams } from './diagrams/Diagrams';
import { ComponentType, Fragment as ReactFragment, memo, ReactNode, Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import ThermometerIcon from '~icons/lucide/thermometer';
import LightbulbIcon from '~icons/lucide/lightbulb';
import AppWindowIcon from '~icons/lucide/app-window';
import { Channel } from '../types/types';
import { sameItems } from '../hooks/channels';
import { controlOverrides, SectionId } from '../controls/registry';
import { ControlComponent } from '../components/ControlComponent';
import { AlarmBanner, AlarmsSheet } from '../components/Alarms';
import { windowState } from '../controls/WindowControl';
import { useEffects } from '../contexts/EffectsContext';
import { channelTypeName } from '../i18n/channelTypeNames';
import { getLocale } from '../paraglide/runtime';
import { m } from '../paraglide/messages';
import { TileSkeleton, TileSkeletonGrid } from '../components/ui/skeleton';
import { cn } from '../lib/utils';
import { useLayout, useSetLayout } from '../queries';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useToast } from '../contexts/ToastContext';
import { usePageArrange } from '../contexts/PageTitleContext';
import { Button } from '../components/ui/button';
import { GridDashboard, GridTile } from './grid/GridDashboard';
import { moveSection, orderSections, parseLayout, SavedLayout, SectionLayout } from './grid/tileLayout';
import ChevronUpIcon from '~icons/lucide/chevron-up';
import ChevronDownIcon from '~icons/lucide/chevron-down';
import { isLight as isLightTile, useLightTradeIds } from '../controls/light/isLight';

// --- Tabs of rooms, trades or favorite lists, with a marker that glides
// to the active one

interface NavTabsProps {
  label: string;
  items: { id: number; name: string }[];
  activeId: string;
  to: '/room/$roomId' | '/trade/$tradeId' | '/favorite/$favoriteId';
}

const tabParams = (to: NavTabsProps['to'], id: string) =>
  to === '/room/$roomId' ? { roomId: id } : to === '/trade/$tradeId' ? { tradeId: id } : { favoriteId: id };

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
              boxShadow: effects.on
                ? `0 0 ${18 * effects.k}px rgba(250,250,250,${Math.min(1, 0.14 * effects.k)})`
                : undefined,
            }}
          />
        )}
        {items.map((item) => {
          const active = String(item.id) === activeId;
          return (
            <Link
              key={item.id}
              to={to}
              params={tabParams(to, String(item.id)) as never}
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

// Dimmers of the "lights" section, and the switches among them that drive
// a lamp as their tile shows it (isLight: pumps and heaters don't count);
// on when STATE or LEVEL say so
const isLight = (channel: Channel, lightTradeIds: Set<number>) => {
  if (controlOverrides[channel.type]?.section !== 'lights') return false;
  const dp = channel.datapoints as Record<string, unknown>;
  return 'LEVEL' in dp || isLightTile(channel, lightTradeIds);
};
const isLightOn = (channel: Channel, lightTradeIds: Set<number>) => {
  if (!isLight(channel, lightTradeIds)) return false;
  const dp = channel.datapoints as Record<string, unknown>;
  return dp.STATE === true || (typeof dp.LEVEL === 'number' && dp.LEVEL > 0) || Number(dp.LEVEL) > 0;
};

const Stat = ({ icon, tint, label, value }: { icon: ReactNode; tint: string; label: string; value: string }) => (
  <div className="tile-edge flex min-w-0 items-center gap-3 rounded-2xl border bg-card p-4">
    <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5', tint)}>
      {icon}
    </div>
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="truncate text-xl font-semibold">{value}</div>
    </div>
  </div>
);

const Overview = ({ channels }: { channels: Channel[] }) => {
  const reachable = channels.filter((c) => !c.status?.UNREACH);
  const temperatures = reachable
    .filter((c) => controlOverrides[c.type]?.section === 'climate')
    .map((c) => (c.datapoints as Record<string, unknown>).ACTUAL_TEMPERATURE)
    .filter((t): t is number => typeof t === 'number');
  const lightTradeIds = useLightTradeIds();
  const switches = channels.filter((c) => isLight(c, lightTradeIds));
  const switchedOn = switches.filter((c) => isLightOn(c, lightTradeIds)).length;
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
  security: m.SECTION_SECURITY,
  signals: m.SECTION_SIGNALS,
  sensors: m.SECTION_SENSORS,
  water: m.SECTION_WATER,
  drives: m.SECTION_DRIVES,
  buttons: m.SECTION_BUTTONS,
  inputs: m.SECTION_INPUTS,
  energy: m.SECTION_ENERGY,
  system: m.SECTION_SYSTEM,
};

// The narrowest a tile of each section looks right (as the grids below)
const sectionMinPx: Record<SectionId | 'generic', number> = {
  climate: 232,
  floor: 300,
  lights: 150,
  blinds: 300,
  windows: 220,
  doors: 340,
  security: 250,
  signals: 250,
  sensors: 250,
  water: 250,
  drives: 280,
  buttons: 240,
  inputs: 250,
  energy: 260,
  system: 260,
  generic: 240,
};

// The tiles of a section in order, for arranging them in a grid
const gridTiles = (group: SectionGroup): GridTile[] => {
  const minPx = sectionMinPx[group.section ?? 'generic'];
  return group.types.flatMap(([type, channels]) => {
    const override = controlOverrides[type];
    return override?.per === 'device'
      ? groupByDevice(channels).map(([deviceAddress, deviceChannels]) => ({
          key: `d:${deviceAddress}`,
          minPx: sectionMinPx[override.section ?? 'generic'] ?? minPx,
          channelIds: deviceChannels.map((c) => c.id),
          element: <DeviceTile component={override.component} channels={deviceChannels} />,
        }))
      : channels.map((channel) => ({
          key: `c:${channel.address}`,
          minPx: sectionMinPx[override?.section ?? 'generic'] ?? minPx,
          span: override?.wide ? 2 : 1,
          channelIds: [channel.id],
          element: <ControlComponent channel={channel} />,
        }));
  });
};

const sectionGrids: Record<SectionId | 'generic', string> = {
  climate: '[grid-template-columns:repeat(auto-fill,minmax(232px,1fr))]',
  floor: '[grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]',
  lights: 'items-start [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]',
  blinds: '[grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]',
  windows: '[grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]',
  doors: '[grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]',
  security: 'items-start [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]',
  signals: 'items-start [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]',
  sensors: 'items-start [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]',
  water: 'items-start [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]',
  drives: 'items-start [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]',
  buttons: '[grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]',
  inputs: 'items-start [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]',
  energy: '[grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]',
  system: '[grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]',
  generic: '[grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]',
};

// A control for all channels of a device: rendered again only when one of
// them changed (the list itself is new whenever its section is rebuilt)
const DeviceTile = memo(
  function DeviceTile({ component: Component, channels }: { component: ComponentType<{ channels: Channel[] }>; channels: Channel[] }) {
    return (
      <Suspense fallback={<TileSkeleton />}>
        <Component channels={channels} />
      </Suspense>
    );
  },
  (before, after) => before.component === after.component && sameItems(before.channels, after.channels),
);

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

// A free arrangement: one section without heading, the tiles in the
// order of the favorite list
const FREE = 'free';

interface SectionProps {
  group: SectionGroup;
  // While arranging, or once arranged: the tiles in a grid
  grid: boolean;
  editing: boolean;
  layout?: SectionLayout;
  onLayout: (layout: SectionLayout) => void;
  // Moving the section, while arranging
  onMove?: (delta: -1 | 1) => void;
  first?: boolean;
  last?: boolean;
  // Favorite lists: the tiles in this order (channel ids)
  order?: number[];
}

const Section = ({ group, grid, editing, layout, onLayout, onMove, first, last, order }: SectionProps) => {
  const free = group.key === FREE;
  // Types without a translation (shown by GenericControl) keep the CCU's name
  const title = group.section ? sectionTitles[group.section]() : free ? '' : channelTypeName(group.types[0][0]);
  const id = `section-${group.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const count = group.types.reduce((sum, [, channels]) => sum + channels.length, 0);
  const tiles = useMemo(() => {
    const list = gridTiles(group);
    if (!order) return list;
    const rank = (tile: GridTile) => {
      const ranks = (tile.channelIds ?? []).map((cid) => order.indexOf(cid)).filter((r) => r >= 0);
      return ranks.length > 0 ? Math.min(...ranks) : order.length;
    };
    return list
      .map((tile, index) => ({ tile, index }))
      .sort((a, b) => rank(a.tile) - rank(b.tile) || a.index - b.index)
      .map(({ tile }) => tile);
  }, [group, order]);
  return (
    <section
      aria-labelledby={free ? undefined : id}
      aria-label={free ? m.FAVORITES() : undefined}
      className="flex flex-col gap-3"
    >
      {!free && (
        <div className="flex items-baseline gap-2">
          <h2 id={id} className="text-[19px] font-semibold tracking-tight">
            {title}
          </h2>
          <span className="text-sm text-muted-foreground">{count}</span>
          {editing && onMove && (
            // Not taller than the title, so the section doesn't move
            <span className="-my-2 ml-auto flex gap-1 self-center">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label={m.LAYOUT_SECTION_UP({ name: title })}
                disabled={first}
                onClick={() => onMove(-1)}
              >
                <ChevronUpIcon />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label={m.LAYOUT_SECTION_DOWN({ name: title })}
                disabled={last}
                onClick={() => onMove(1)}
              >
                <ChevronDownIcon />
              </Button>
            </span>
          )}
        </div>
      )}
      {grid || free ? (
        <GridDashboard
          tiles={tiles}
          saved={layout}
          editing={editing}
          onChange={onLayout}
          // As the section's own grid: tiles side by side as tall as the tallest
          equalRows={!sectionGrids[group.section ?? 'generic'].includes('items-start')}
        />
      ) : (
        <div className={cn('grid gap-3', sectionGrids[group.section ?? 'generic'])}>
          {tiles.map((tile) => (
            <ReactFragment key={tile.key}>{tile.element}</ReactFragment>
          ))}
        </div>
      )}
    </section>
  );
};

// --- The page

interface DashboardProps {
  tabs?: ReactNode;
  // The room, trade or favorite list whose tiles can be arranged by hand
  layoutId?: number;
  channelsByType: [string, Channel[]][];
  isLoading?: boolean;
  // Loading failed: shown with a retry instead of "no devices"
  error?: Error | null;
  onRetry?: () => void;
  // Shown after the sections (a favorite list's variables and programs)
  extra?: ReactNode;
  // Instead of "no channels" when there is nothing to show
  empty?: ReactNode;
  // A favorite list: its channels (ids) in order, arranged freely without
  // sections
  freeOrder?: number[];
}

export const Dashboard = ({ tabs, layoutId, channelsByType, isLoading, error, onRetry, extra, empty, freeOrder }: DashboardProps) => {
  const { userLevel } = useWebSocketContext();
  const { data: layoutJson } = useLayout(layoutId);
  const setLayout = useSetLayout();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SavedLayout | null>(null);
  const saved = useMemo(() => parseLayout(layoutJson), [layoutJson]);
  // Sections whose types an event didn't touch stay the same objects, so
  // their tiles and grid aren't built again (shareGroups in useChannels)
  const previousGroups = useRef(new Map<string, SectionGroup>());
  const groups = useMemo<SectionGroup[]>(() => {
    const next = freeOrder
      ? channelsByType.length > 0
        ? [{ key: FREE, types: channelsByType }]
        : []
      : groupIntoSections(channelsByType);
    const shared = next.map((group) => {
      const before = previousGroups.current.get(group.key);
      return before && sameItems(before.types, group.types) ? before : group;
    });
    previousGroups.current = new Map(shared.map((group) => [group.key, group]));
    return shared;
  }, [channelsByType, freeOrder]);
  const layout = draft ?? saved;
  const sections = orderSections(groups, layout?.order ?? []);
  const change = (next: Partial<SavedLayout>) =>
    setDraft({ v: 3, order: sections.map((g) => g.key), sections: {}, ...layout, ...next });
  const canArrange = layoutId !== undefined && userLevel !== 'guest' && channelsByType.length > 0;
  const store = (layout: string, after: () => void) =>
    setLayout.mutate(
      { id: layoutId ?? 0, layout },
      {
        onSuccess: () => {
          after();
          showToast(m.LAYOUT_SAVED(), 'info');
        },
        onError: (error) => showToast(`${m.SAVE_FAILED()}: ${error.message}`),
      },
    );
  const finish = () => {
    setEditing(false);
    setDraft(null);
  };
  // The buttons sit in the header (to start on phones in the menu), so
  // nothing on the page moves when arranging starts
  usePageArrange(
    canArrange
      ? {
          editing,
          busy: setLayout.isPending,
          start: () => setEditing(true),
          done: () => (draft ? store(JSON.stringify(draft), finish) : finish()),
          cancel: finish,
          reset: saved ? () => store('', finish) : undefined,
        }
      : null,
  );
  const effects = useEffects();
  const channels = useMemo(() => channelsByType.flatMap(([, list]) => list), [channelsByType]);
  const lightTradeIds = useLightTradeIds();
  const lightsOn = channels.filter((c) => isLightOn(c, lightTradeIds)).length;
  const [alarmsOpen, setAlarmsOpen] = useState(false);
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
      <AlarmBanner onShowAll={() => setAlarmsOpen(true)} />
      <AlarmsSheet open={alarmsOpen} onOpenChange={setAlarmsOpen} />
      <Overview channels={channels} />
      {sections.map((group, index) => (
        <Section
          key={group.key}
          group={group}
          grid={editing || !!layout?.sections[group.key]}
          editing={editing}
          layout={layout?.sections[group.key]}
          onLayout={(sectionLayout) => change({ sections: { ...layout?.sections, [group.key]: sectionLayout } })}
          onMove={
            sections.length > 1
              ? (delta) =>
                  change({
                    order: moveSection(
                      sections.map((g) => g.key),
                      group.key,
                      delta,
                    ),
                  })
              : undefined
          }
          first={index === 0}
          last={index === sections.length - 1}
          order={freeOrder}
        />
      ))}
      {isLoading && channelsByType.length === 0 && <TileSkeletonGrid />}
      {layoutId !== undefined && <PlaceDiagrams place={layoutId} />}
      {extra}
      {!isLoading && channelsByType.length === 0 && error && (
        <div role="alert" className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
          <p>
            {m.CHANNELS_LOAD_FAILED()}: {error.message}
          </p>
          {onRetry && (
            <Button variant="outline" onClick={onRetry}>
              {m.RETRY()}
            </Button>
          )}
        </div>
      )}
      {!isLoading && channelsByType.length === 0 && !error && !extra && (
        <p className="py-12 text-center text-muted-foreground">{empty ?? m.NO_CHANNELS()}</p>
      )}
    </div>
  );
};
