import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocketActions } from '../hooks/useWebsocket';

// Seconds pairing is still on for an interface (0: off), polled while on
// Polled every second while the install mode runs, not after it ended
export const useInstallMode = (interfaceName: string, { enabled = true }: { enabled?: boolean } = {}) => {
  const { request } = useWebSocketActions();
  return useQuery({
    enabled,
    queryKey: ['installMode', interfaceName],
    queryFn: async () => {
      const response = await request({ type: 'getInstallMode', interfaceName });
      // BidCos-RF: a device that failed for another security key; HmIP-RF
      // on openccu-lite: how the system pairs
      return { seconds: response.seconds ?? 0, keyMismatch: response.keyMismatch, hmip: response.hmip };
    },
    refetchInterval: (query) => ((query.state.data?.seconds ?? 0) > 0 ? 1000 : false),
    retry: false,
  });
};

// The connected interfaces; BidCos-Wired only with a Wired gateway
export const useInterfaces = () => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['interfaces'],
    queryFn: async () => (await request({ type: 'getInterfaces' })).interfaces ?? [],
  });
};

// Paired devices not yet accepted
export const useInbox = ({ poll = false, enabled = true }: { poll?: boolean; enabled?: boolean }) => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['inbox'],
    queryFn: async () => (await request({ type: 'getInbox' })).devices ?? [],
    refetchInterval: poll ? 3000 : false,
    enabled,
    retry: false,
  });
};

export type PairingAction =
  | { type: 'setInstallMode'; interfaceName: string; on: boolean; seconds: number; sgtin?: string; key?: string }
  | { type: 'addDeviceBySerial'; interfaceName: string; address: string }
  | { type: 'setTempKey'; interfaceName: string; key: string }
  | { type: 'acceptDevice'; address: string }
  | { type: 'searchWiredDevices' }
  | { type: 'deleteDevice'; interfaceName: string; address: string; reset: boolean; force: boolean };

export const usePairingAction = () => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: PairingAction) => {
      await request(action, { queue: false });
    },
    onSettled: () =>
      Promise.all(
        ['installMode', 'inbox', 'devices', 'channels'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
};
