// The command palette's entries and their ranking, as plain data: what the
// palette lists (pages, rooms, trades, favorite lists, channels, programs,
// system variables, a few actions) and in which order a query puts them.
// CommandPalette.tsx only draws this and carries it out.

import { matchScore } from './channelSearch';

export type PaletteGroup = 'pages' | 'rooms' | 'trades' | 'favorites' | 'channels' | 'programs' | 'sysvars' | 'actions';

// Where an entry leads: a route of the app, or an action the palette runs
export type PaletteTarget =
  | { kind: 'route'; to: string; params?: Record<string, string> }
  | { kind: 'action'; action: 'toggleTheme' | 'arrange' | 'logout' };

// The icons an entry can have, drawn by CommandPalette.tsx
export type PaletteIcon =
  | 'star'
  | 'list'
  | 'braces'
  | 'play'
  | 'chart'
  | 'heart'
  | 'history'
  | 'bell'
  | 'sliders'
  | 'home'
  | 'tag'
  | 'device'
  | 'moon'
  | 'grid'
  | 'logout';

export interface PaletteEntry {
  // Unique within the palette; also the React key
  id: string;
  group: PaletteGroup;
  label: string;
  // Secondary text on the right (the room of a channel, the address, ...)
  detail?: string;
  // Searched along with the label, not shown
  keywords?: string[];
  icon: PaletteIcon;
  target: PaletteTarget;
}

// The order of the groups in the list
export const GROUP_ORDER: PaletteGroup[] = [
  'pages',
  'rooms',
  'trades',
  'favorites',
  'channels',
  'programs',
  'sysvars',
  'actions',
];

// Entries shown per group: without a query a short list to start from,
// with one enough to scroll through but not the whole installation
const LIMIT_EMPTY: Record<PaletteGroup, number> = {
  pages: 12,
  rooms: 6,
  trades: 4,
  favorites: 3,
  channels: 0,
  programs: 0,
  sysvars: 0,
  actions: 4,
};
const LIMIT_QUERY = 8;

interface Ranked {
  entry: PaletteEntry;
  score: number;
  index: number;
}

// A hit in the label counts for more than one in a keyword or the detail
const scoreOf = (query: string, entry: PaletteEntry) => {
  const inLabel = matchScore(query, [entry.label]);
  if (inLabel > 0) return inLabel * 2 + 1;
  return matchScore(query, [entry.label, entry.detail ?? '', ...(entry.keywords ?? [])]);
};

// The entries to show for a query, group by group in GROUP_ORDER, the best
// first in each (the given order among equals). An empty query shows the
// start of each group, without the groups that only make sense searched.
export const filterEntries = (entries: PaletteEntry[], query: string): PaletteEntry[] => {
  const searching = query.trim() !== '';
  const byGroup = new Map<PaletteGroup, Ranked[]>();
  entries.forEach((entry, index) => {
    const score = searching ? scoreOf(query, entry) : 1;
    if (score === 0) return;
    byGroup.set(entry.group, [...(byGroup.get(entry.group) ?? []), { entry, score, index }]);
  });
  return GROUP_ORDER.flatMap((group) => {
    const limit = searching ? LIMIT_QUERY : LIMIT_EMPTY[group];
    return (byGroup.get(group) ?? [])
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, limit)
      .map((r) => r.entry);
  });
};

// Moves the highlighted entry by one, around the ends of the list
export const moveActive = (current: number, delta: 1 | -1, count: number) =>
  count === 0 ? 0 : (current + delta + count) % count;

// Cmd+K on a Mac, Ctrl+K elsewhere. Only the one of the platform: on a Mac
// Ctrl+K deletes to the end of the line in a text field.
export const isPaletteShortcut = (
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  mac: boolean,
) =>
  e.key.toLowerCase() === 'k' && (mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.altKey && !e.shiftKey;

// The shortcut as the tooltip shows it
export const paletteShortcutLabel = (mac: boolean) => (mac ? '⌘K' : 'Ctrl+K');

// Whether the browser runs on an Apple system, where Cmd takes the place of Ctrl
export const isApplePlatform = (nav: { platform?: string; userAgent?: string }) =>
  /Mac|iPhone|iPad|iPod/.test(nav.platform || nav.userAgent || '');
