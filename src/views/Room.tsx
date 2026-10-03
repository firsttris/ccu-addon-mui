import { useEffect } from 'react';
import { useParams } from '@tanstack/react-router';
import { useChannels, useRooms } from '../queries';
import { usePageTitle } from '../contexts/PageTitleContext';
import { Dashboard, NavTabs } from './Dashboard';
import { m } from '../paraglide/messages';
import { rememberView } from '../lib/startPage';

// The start page opens the room shown last
export const LAST_ROOM_KEY = 'last-room';

export const Room = () => {
  const { roomId } = useParams({ from: '/room/$roomId' });
  const { data: rooms = [] } = useRooms();
  const { channelsByType, isLoading } = useChannels({ roomId });
  usePageTitle(rooms.find((room) => String(room.id) === roomId)?.name ?? m.ROOMS());

  useEffect(() => {
    try {
      localStorage.setItem(LAST_ROOM_KEY, roomId);
    } catch {
      // Private mode: start with the first room
    }
    rememberView({ kind: 'room', id: roomId });
  }, [roomId]);

  return (
    <Dashboard
      tabs={<NavTabs label={m.ROOMS()} items={rooms} activeId={roomId} to="/room/$roomId" />}
      channelsByType={channelsByType}
      isLoading={isLoading}
    />
  );
};
