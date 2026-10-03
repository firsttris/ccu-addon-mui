import { Navigate } from '@tanstack/react-router';
import { useRooms } from '../queries';
import { LAST_ROOM_KEY } from './Room';

const lastRoom = () => {
  try {
    return localStorage.getItem(LAST_ROOM_KEY);
  } catch {
    return null;
  }
};

// The start page is a room: the one shown last, else the first. Without
// rooms, all devices.
export const Home = () => {
  const { data: rooms, isError } = useRooms();
  if (isError) {
    return <Navigate to="/devices" replace />;
  }
  if (!rooms) {
    return null;
  }
  if (rooms.length === 0) {
    return <Navigate to="/devices" replace />;
  }
  const remembered = lastRoom();
  const room = rooms.find((r) => String(r.id) === remembered) ?? rooms[0];
  return <Navigate to="/room/$roomId" params={{ roomId: String(room.id) }} replace />;
};
