// What the command palette lists, built from the data of the queries: the
// pages, rooms, trades, favorite lists, channels, programs and system
// variables, and the actions. Pages and entries the user may not use, or the
// platform does not have, are left out.

import { isHiddenChannel, withoutMirrors } from '../hooks/channels';
import { sysvarFocusId, tileFocusId } from '../hooks/focusModel';
import type { Capabilities } from '../hooks/capabilities';
import { channelTypeName } from '../i18n/channelTypeNames';
import { m } from '../paraglide/messages';
import type { Favorite } from '../types/protocol';
import type { Channel, Program, Room, Sysvar, Trade, UserLevel } from '../types/types';
import type { PaletteEntry, PaletteIcon, PaletteTarget } from './commandPaletteModel';

export interface EntrySources {
  rooms: Room[];
  trades: Trade[];
  favorites: Favorite[];
  channels: Channel[];
  programs: Program[];
  sysvars: Sysvar[];
  capabilities: Capabilities;
  userLevel: UserLevel;
  authRequired: boolean;
  // The page can be arranged right now
  arrange: boolean;
}

const route = (to: string, params?: Record<string, string>, hash?: string): PaletteTarget => ({
  kind: 'route',
  to,
  params,
  hash,
});

const page = (id: string, label: string, icon: PaletteIcon, to: string): PaletteEntry => ({
  id: `page:${id}`,
  group: 'pages',
  label,
  icon,
  target: route(to),
});

const action = (
  id: string,
  label: string,
  icon: PaletteIcon,
  run: 'toggleTheme' | 'arrange' | 'logout',
): PaletteEntry => ({
  id: `action:${id}`,
  group: 'actions',
  label,
  icon,
  target: { kind: 'action', action: run },
});

const only = <T>(condition: boolean, items: T[]): T[] => (condition ? items : []);

// A channel opens in the first room or trade it belongs to, else in the
// list of all devices, at its tile
export const channelTarget = (channel: Channel): PaletteTarget => {
  const hash = tileFocusId(channel.id);
  if (channel.rooms?.[0] !== undefined) return route('/room/$roomId', { roomId: String(channel.rooms[0]) }, hash);
  if (channel.trades?.[0] !== undefined) return route('/trade/$tradeId', { tradeId: String(channel.trades[0]) }, hash);
  return route('/devices', undefined, hash);
};

// The pages of the menu (Header.tsx), with the same conditions
const pageEntries = ({ capabilities, userLevel }: EntrySources): PaletteEntry[] => [
  page('favorites', m.FAVORITES(), 'star', '/favorites'),
  page('devices', m.ALL_DEVICES(), 'list', '/devices'),
  ...only(capabilities.sysvars, [page('sysvars', m.SYSVARS(), 'braces', '/sysvars')]),
  ...only(capabilities.programs, [page('programs', m.PROGRAMS(), 'play', '/programs')]),
  page('diagrams', m.DIAGRAMS(), 'chart', '/diagrams'),
  page('health', m.HEALTH(), 'heart', '/health'),
  ...only(capabilities.history, [page('history', m.HIST_TITLE(), 'history', '/history')]),
  page('rules', m.RULES(), 'bell', '/rules'),
  ...only(userLevel === 'admin', [page('setup', m.SETUP(), 'sliders', '/setup')]),
];

const placeEntries = ({ rooms, trades, favorites }: EntrySources): PaletteEntry[] => [
  ...rooms.map(
    (r): PaletteEntry => ({
      id: `room:${r.id}`,
      group: 'rooms',
      label: r.name,
      icon: 'home',
      target: route('/room/$roomId', { roomId: String(r.id) }),
    }),
  ),
  ...trades.map(
    (t): PaletteEntry => ({
      id: `trade:${t.id}`,
      group: 'trades',
      label: t.name,
      icon: 'tag',
      target: route('/trade/$tradeId', { tradeId: String(t.id) }),
    }),
  ),
  ...favorites.map(
    (f): PaletteEntry => ({
      id: `favorite:${f.id}`,
      group: 'favorites',
      label: f.name,
      icon: 'star',
      target: route('/favorite/$favoriteId', { favoriteId: String(f.id) }),
    }),
  ),
];

const channelEntries = ({ channels, rooms, trades }: EntrySources): PaletteEntry[] => {
  const roomNames = new Map(rooms.map((r) => [r.id, r.name]));
  const tradeNames = new Map(trades.map((t) => [t.id, t.name]));
  // As the rooms and the device list (useChannels, groupChannelsByType): not
  // the channels the WebUI's option "sichtbar" hides, nor a transmitter
  // that only repeats the state of its virtual receiver
  return withoutMirrors(channels.filter((c) => !c.hidden))
    .filter((c) => !isHiddenChannel(c))
    .map(
      (c): PaletteEntry => ({
        id: `channel:${c.id}`,
        group: 'channels',
        label: c.displayName ?? c.name,
        detail: [...(c.rooms ?? []).map((id) => roomNames.get(id)), ...(c.trades ?? []).map((id) => tradeNames.get(id))]
          .filter(Boolean)
          .slice(0, 2)
          .join(' · '),
        keywords: [c.name, channelTypeName(c.type), c.address],
        icon: 'device',
        target: channelTarget(c),
      }),
    );
};

// As the lists of the logic pages (Logic.tsx): hidden ones only for
// administrators, internal programs not at all. A program opens its editor,
// it is never run from here.
const logicEntries = ({ programs, sysvars, capabilities, userLevel }: EntrySources): PaletteEntry[] => [
  ...only(capabilities.programs, programs)
    .filter((p) => !p.internal && (p.visible || userLevel === 'admin'))
    .map(
      (p): PaletteEntry => ({
        id: `program:${p.id}`,
        group: 'programs',
        label: p.name,
        icon: 'play',
        target: route('/program/$programId', { programId: String(p.id) }),
      }),
    ),
  ...only(capabilities.sysvars, sysvars)
    .filter((v) => v.visible || userLevel === 'admin')
    .map(
      (v): PaletteEntry => ({
        id: `sysvar:${v.id}`,
        group: 'sysvars',
        label: v.name,
        detail: v.description,
        icon: 'braces',
        target: route('/sysvars', undefined, sysvarFocusId(v.id)),
      }),
    ),
];

const actionEntries = ({ arrange, authRequired }: EntrySources): PaletteEntry[] => [
  action('theme', m.DARK_MODE(), 'moon', 'toggleTheme'),
  ...only(arrange, [action('arrange', m.LAYOUT_ARRANGE(), 'grid', 'arrange')]),
  ...only(authRequired, [action('logout', m.LOGOUT(), 'logout', 'logout')]),
];

// Everything the palette can list
export const buildEntries = (sources: EntrySources): PaletteEntry[] => [
  ...pageEntries(sources),
  ...placeEntries(sources),
  ...channelEntries(sources),
  ...logicEntries(sources),
  ...actionEntries(sources),
];
