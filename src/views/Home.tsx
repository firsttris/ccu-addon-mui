import { Navigate } from '@tanstack/react-router';
import { useFavorites, useRooms } from '../queries';
import { getLastView, getStartPage } from '../lib/startPage';
import { LAST_ROOM_KEY } from './Room';
import { LAST_FAVORITE_KEY } from './Favorites';

const stored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

// The start page: the favorites if chosen in the menu (the list shown
// last), else the view shown last (a room or a favorite list), else the
// first room. Without rooms, all devices.
export const Home = () => {
  const { data: rooms, isError } = useRooms();
  const { data: favorites, isError: favoritesError } = useFavorites();
  const startPage = getStartPage();
  const lastView = getLastView();

  if (!favorites && !favoritesError) {
    return null;
  }
  const favorite =
    startPage === 'favorites'
      ? favorites?.find((f) => String(f.id) === stored(LAST_FAVORITE_KEY)) ?? favorites?.[0]
      : lastView?.kind === 'favorite'
        ? favorites?.find((f) => String(f.id) === lastView.id)
        : undefined;
  if (favorite) {
    return <Navigate to="/favorite/$favoriteId" params={{ favoriteId: String(favorite.id) }} replace />;
  }

  if (isError) {
    return <Navigate to="/devices" replace />;
  }
  if (!rooms) {
    return null;
  }
  if (rooms.length === 0) {
    return <Navigate to="/devices" replace />;
  }
  const remembered = lastView?.kind === 'room' ? lastView.id : stored(LAST_ROOM_KEY);
  const room = rooms.find((r) => String(r.id) === remembered) ?? rooms[0];
  return <Navigate to="/room/$roomId" params={{ roomId: String(room.id) }} replace />;
};
