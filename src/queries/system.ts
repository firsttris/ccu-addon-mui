import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocketActions } from '../hooks/useWebsocket';

// Versions and radio modules (administrators); the duty cycle changes slowly
export const useSystemInfo = () => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['systemInfo'],
    queryFn: () => request({ type: 'getSystemInfo' }),
    refetchInterval: 60000,
    retry: false,
  });
};

// Logged-in devices (administrators with admin token)
export const useSessions = ({ enabled }: { enabled: boolean }) => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['sessions'],
    queryFn: async () => (await request({ type: 'listSessions' })).sessions ?? [],
    enabled,
    retry: false,
  });
};

export const useRevokeSession = () => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await request({ type: 'revokeSession', id }, { queue: false });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
};
