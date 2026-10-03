import { useQuery } from '@tanstack/react-query';
import { useWebSocketActions } from '../hooks/useWebsocket';

// Server data loaded through TanStack Query. The queryFn sends its request
// over the WebSocket (request() in useWebsocket); after a reconnect all
// queries are invalidated.

export const useRooms = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['rooms'],
    queryFn: async () => (await request({ type: 'getRooms' })).rooms ?? [],
    enabled,
  });
};

export const useTrades = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['trades'],
    queryFn: async () => (await request({ type: 'getTrades' })).trades ?? [],
    enabled,
  });
};
