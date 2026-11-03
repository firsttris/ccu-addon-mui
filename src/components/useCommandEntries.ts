import { useMemo } from 'react';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useChannelList, useFavorites, usePrograms, useRooms, useSysvars, useTrades } from '../queries';
import { buildEntries } from './commandEntriesModel';
import type { PaletteEntry } from './commandPaletteModel';

// Everything the palette can list, loaded when it is first opened (the
// component mounts only while open)
export const useCommandEntries = (arrange: boolean): PaletteEntry[] => {
  const { capabilities, userLevel, authRequired } = useWebSocketContext();
  const { data: rooms = [] } = useRooms();
  const { data: trades = [] } = useTrades();
  const { data: favorites = [] } = useFavorites();
  const { data: channels = [] } = useChannelList();
  const { data: programs = [] } = usePrograms();
  const { data: sysvars = [] } = useSysvars();

  return useMemo(
    () =>
      buildEntries({
        rooms,
        trades,
        favorites,
        channels,
        programs,
        sysvars,
        capabilities,
        userLevel,
        authRequired,
        arrange,
      }),
    [rooms, trades, favorites, channels, programs, sysvars, capabilities, userLevel, authRequired, arrange],
  );
};
