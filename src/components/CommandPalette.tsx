import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import SearchIcon from '~icons/lucide/search';
import StarIcon from '~icons/lucide/star';
import ListIcon from '~icons/lucide/list';
import BracesIcon from '~icons/lucide/braces';
import PlayIcon from '~icons/lucide/play';
import ChartIcon from '~icons/lucide/chart-line';
import HeartPulseIcon from '~icons/lucide/heart-pulse';
import HistoryIcon from '~icons/lucide/history';
import BellIcon from '~icons/lucide/bell';
import SlidersIcon from '~icons/lucide/sliders-horizontal';
import HomeIcon from '~icons/lucide/house';
import TagIcon from '~icons/lucide/tag';
import PlugIcon from '~icons/lucide/plug';
import MoonIcon from '~icons/lucide/moon';
import LayoutGridIcon from '~icons/lucide/layout-grid';
import LogOutIcon from '~icons/lucide/log-out';
import { useTheme } from '../contexts/ThemeContext';
import { usePageArrangeValue } from '../contexts/PageTitleContext';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import {
  filterEntries,
  moveActive,
  type PaletteEntry,
  type PaletteGroup,
  type PaletteIcon,
} from './commandPaletteModel';
import { useCommandEntries } from './useCommandEntries';

const ICONS: Record<PaletteIcon, React.ComponentType<{ className?: string }>> = {
  star: StarIcon,
  list: ListIcon,
  braces: BracesIcon,
  play: PlayIcon,
  chart: ChartIcon,
  heart: HeartPulseIcon,
  history: HistoryIcon,
  bell: BellIcon,
  sliders: SlidersIcon,
  home: HomeIcon,
  tag: TagIcon,
  device: PlugIcon,
  moon: MoonIcon,
  grid: LayoutGridIcon,
  logout: LogOutIcon,
};

const GROUP_LABELS: Record<PaletteGroup, () => string> = {
  pages: m.PALETTE_PAGES,
  rooms: m.ROOMS,
  trades: m.TRADES,
  favorites: m.FAVORITES,
  channels: m.PALETTE_CHANNELS,
  programs: m.PROGRAMS,
  sysvars: m.SYSVARS,
  actions: m.PALETTE_ACTIONS,
};

const PaletteBody = ({ close }: { close: () => void }) => {
  const navigate = useNavigate();
  const { toggleTheme } = useTheme();
  const arrange = usePageArrangeValue();
  const { logout } = useWebSocketContext();
  const entries = useCommandEntries(!!arrange && !arrange.editing);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => filterEntries(entries, query), [entries, query]);
  const current = Math.min(active, Math.max(0, shown.length - 1));

  // biome-ignore lint/correctness/useExhaustiveDependencies: scrolls when the highlighted entry changes
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [current, query]);

  const run = (entry: PaletteEntry) => {
    close();
    const { target } = entry;
    if (target.kind === 'route') {
      // The route is a path pattern of the router, typed per route there
      navigate({ to: target.to as never, params: target.params as never, hash: target.hash });
    } else if (target.action === 'toggleTheme') toggleTheme();
    else if (target.action === 'arrange') arrange?.start();
    else logout();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(moveActive(current, e.key === 'ArrowDown' ? 1 : -1, shown.length));
    } else if (e.key === 'Enter' && shown[current] && !e.nativeEvent.isComposing) {
      e.preventDefault();
      run(shown[current]);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b px-4">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <input
          // biome-ignore lint/a11y/noAutofocus: the palette opens to type into
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={shown[current] ? `palette-${shown[current].id}` : undefined}
          aria-label={m.PALETTE_OPEN()}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={m.PALETTE_PLACEHOLDER()}
          className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div ref={listRef} id="palette-list" role="listbox" className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
        {shown.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">{m.PALETTE_EMPTY()}</p>
        )}
        {shown.map((entry, i) => {
          const Icon = ICONS[entry.icon];
          const heading = i === 0 || shown[i - 1].group !== entry.group;
          return (
            <div key={entry.id} role="presentation">
              {heading && (
                <div role="presentation" className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                  {GROUP_LABELS[entry.group]()}
                </div>
              )}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard stays in the combobox, which moves aria-activedescendant over the options and runs one with Enter */}
              <div
                id={`palette-${entry.id}`}
                role="option"
                tabIndex={-1}
                aria-selected={i === current}
                onMouseMove={() => setActive(i)}
                onClick={() => run(entry)}
                className={cn(
                  'flex h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-[15px]',
                  i === current && 'bg-accent',
                )}
              >
                <Icon className="size-[18px] shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{entry.label}</span>
                {entry.detail && (
                  <span className="max-w-[40%] truncate text-xs text-muted-foreground">{entry.detail}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="hidden border-t px-4 py-2 text-xs text-muted-foreground sm:block">{m.PALETTE_HINT()}</div>
    </>
  );
};

// Search and commands in one dialog: pages, rooms, devices, programs and a
// few actions, found by typing and reached with the keyboard (Ctrl/Cmd+K)
export const CommandPalette = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent showCloseButton={false} className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
      <DialogTitle className="sr-only">{m.PALETTE_OPEN()}</DialogTitle>
      <DialogDescription className="sr-only">{m.PALETTE_PLACEHOLDER()}</DialogDescription>
      <PaletteBody close={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>
);
