import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocketActions } from '../hooks/useWebsocket';

// The favorite lists of the logged-in CCU user, as the WebUI's
// "Favoriten" (rega/esp/favorites.fn)
export const useFavorites = () => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['favorites'],
    queryFn: async () => (await request({ type: 'getFavorites' })).favorites ?? [],
  });
};

export type FavoriteChange =
  | { type: 'createFavorite'; name: string }
  | { type: 'renameFavorite'; id: number; name: string }
  | { type: 'deleteFavorite'; id: number }
  | { type: 'addFavoriteItem' | 'removeFavoriteItem'; id: number; itemId: number };

// Creates, renames or deletes a favorite list, or adds and removes entries
export const useFavoriteChange = () => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (change: FavoriteChange) => request(change, { queue: false }),
    // Awaited, so a new list is known before the page switches to it
    onSettled: (_, __, change) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['favorites'] }),
        'id' in change && queryClient.invalidateQueries({ queryKey: ['channels', { favoriteId: String(change.id) }] }),
      ]),
  });
};
