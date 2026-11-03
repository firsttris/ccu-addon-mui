import { useMemo } from 'react';
import { isHiddenChannel } from '../hooks/channels';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { channelTypeName } from '../i18n/channelTypeNames';
import { m } from '../paraglide/messages';
import { useChannelList, useFavorites, usePrograms, useRooms, useSysvars, useTrades } from '../queries';
import type { Channel } from '../types/types';
import type { PaletteEntry, PaletteTarget } from './commandPaletteModel';

const route = (to: string, params?: Record<string, string>): PaletteTarget => ({ kind: 'route', to, params });

// A channel opens in the first room or trade it belongs to, else in the
// list of all devices
const channelTarget = (channel: Channel): PaletteTarget => {
  if (channel.rooms?.[0] !== undefined) return route('/room/$roomId', { roomId: String(channel.rooms[0]) });
  if (channel.trades?.[0] !== undefined) return route('/trade/$tradeId', { tradeId: String(channel.trades[0]) });
  return route('/devices');
};

// Everything the palette can list, loaded when it is first opened (the
// component mounts only while open). Pages and actions the user may not
// use, or the platform does not have, are left out.
export const useCommandEntries = (arrange: boolean): PaletteEntry[] => {
  const { capabilities, userLevel, authRequired } = useWebSocketContext();
  const { data: rooms = [] } = useRooms();
  const { data: trades = [] } = useTrades();
  const { data: favorites = [] } = useFavorites();
  const { data: channels = [] } = useChannelList();
  const { data: programs = [] } = usePrograms();
  const { data: sysvars = [] } = useSysvars();

  return useMemo(() => {
    const page = (id: string, label: string, icon: string, to: string): PaletteEntry => ({
      id: `page:${id}`,
      group: 'pages',
      label,
      icon,
      target: route(to),
    });
    const roomNames = new Map(rooms.map((r) => [r.id, r.name]));
    const tradeNames = new Map(trades.map((t) => [t.id, t.name]));
    return [
      page('favorites', m.FAVORITES(), 'star', '/favorites'),
      page('devices', m.ALL_DEVICES(), 'list', '/devices'),
      ...(capabilities.sysvars ? [page('sysvars', m.SYSVARS(), 'braces', '/sysvars')] : []),
      ...(capabilities.programs ? [page('programs', m.PROGRAMS(), 'play', '/programs')] : []),
      page('diagrams', m.DIAGRAMS(), 'chart', '/diagrams'),
      page('health', m.HEALTH(), 'heart', '/health'),
      ...(capabilities.history ? [page('history', m.HIST_TITLE(), 'history', '/history')] : []),
      page('rules', m.RULES(), 'bell', '/rules'),
      ...(userLevel === 'admin' ? [page('setup', m.SETUP(), 'sliders', '/setup')] : []),
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
      ...channels
        .filter((c) => !isHiddenChannel(c))
        .map(
          (c): PaletteEntry => ({
            id: `channel:${c.id}`,
            group: 'channels',
            label: c.displayName ?? c.name,
            detail: [
              ...(c.rooms ?? []).map((id) => roomNames.get(id)),
              ...(c.trades ?? []).map((id) => tradeNames.get(id)),
            ]
              .filter(Boolean)
              .slice(0, 2)
              .join(' · '),
            keywords: [c.name, channelTypeName(c.type), c.address],
            icon: 'device',
            target: channelTarget(c),
          }),
        ),
      ...programs
        .filter((p) => !p.internal)
        .map(
          (p): PaletteEntry => ({
            id: `program:${p.id}`,
            group: 'programs',
            label: p.name,
            icon: 'play',
            target: route('/program/$programId', { programId: String(p.id) }),
          }),
        ),
      ...sysvars.map(
        (v): PaletteEntry => ({
          id: `sysvar:${v.id}`,
          group: 'sysvars',
          label: v.name,
          detail: v.description,
          icon: 'braces',
          target: route('/sysvars'),
        }),
      ),
      {
        id: 'action:theme',
        group: 'actions',
        label: m.DARK_MODE(),
        icon: 'moon',
        target: { kind: 'action', action: 'toggleTheme' },
      },
      ...(arrange
        ? [
            {
              id: 'action:arrange',
              group: 'actions',
              label: m.LAYOUT_ARRANGE(),
              icon: 'grid',
              target: { kind: 'action', action: 'arrange' },
            } as PaletteEntry,
          ]
        : []),
      ...(authRequired
        ? [
            {
              id: 'action:logout',
              group: 'actions',
              label: m.LOGOUT(),
              icon: 'logout',
              target: { kind: 'action', action: 'logout' },
            } as PaletteEntry,
          ]
        : []),
    ];
  }, [rooms, trades, favorites, channels, programs, sysvars, capabilities, userLevel, authRequired, arrange]);
};
