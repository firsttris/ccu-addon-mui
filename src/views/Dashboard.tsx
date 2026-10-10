import { PlaceDiagrams } from './diagrams/Diagrams';
import { Fragment as ReactFragment, type ReactNode, useMemo, useRef, useState } from 'react';
import type { Channel } from '../types/types';
import { sameItems } from '../hooks/channels';
import { AlarmBanner, AlarmsSheet } from '../components/Alarms';
import { useEffects } from '../contexts/EffectsContext';
import { channelTypeName } from '../i18n/channelTypeNames';
import { m } from '../paraglide/messages';
import { TileSkeletonGrid } from '../components/ui/skeleton';
import { cn } from '../lib/utils';
import { useLayout, useSetLayout } from '../queries';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useToast } from '../contexts/ToastContext';
import { usePageArrange } from '../contexts/PageTitleContext';
import { Button } from '../components/ui/button';
import { GridDashboard, type GridTile } from './grid/GridDashboard';
import { moveSection, orderSections, parseLayout, type SavedLayout, type SectionLayout } from './grid/tileLayout';
import ChevronUpIcon from '~icons/lucide/chevron-up';
import ChevronDownIcon from '~icons/lucide/chevron-down';
import { useLightTradeIds } from '../controls/light/isLight';
import { Overview, isLightOn } from './DashboardOverview';
import { type SectionGroup, gridTiles, groupIntoSections, sectionGrids, sectionTitles } from './dashboardSections';

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

export const Dashboard = ({
  tabs,
  layoutId,
  channelsByType,
  isLoading,
  error,
  onRetry,
  extra,
  empty,
  freeOrder,
}: DashboardProps) => {
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
          // Once something is moved, or an arrangement is saved
          reset: saved ? () => store('', finish) : draft ? finish : undefined,
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
