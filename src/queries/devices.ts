import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocketActions } from '../hooks/useWebsocket';
import type { DatapointValue } from '../types/types';

// Battery and reachability problems are not pushed by the server
const DEVICE_PROBLEMS_REFRESH_MS = 5 * 60 * 1000;

// The health page: batteries, radio and reachability of all devices
const DEVICE_HEALTH_REFRESH_MS = 60 * 1000;

export const useDeviceProblems = () => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['deviceProblems'],
    queryFn: async () => (await request({ type: 'getDeviceProblems' })).devices ?? [],
    refetchInterval: DEVICE_PROBLEMS_REFRESH_MS,
  });
};

export const useDeviceHealth = () => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['deviceHealth'],
    queryFn: async () => (await request({ type: 'getDeviceHealth' }, { timeoutMs: 30000 })).devices ?? [],
    refetchInterval: DEVICE_HEALTH_REFRESH_MS,
  });
};

// What the parameters of a channel are (type, range, unit, writable). Only
// changes with new firmware, so it is never refetched.
export const useParamsetDescription = (
  interfaceName: string,
  address: string,
  paramsetKey: 'VALUES' | 'MASTER' = 'VALUES',
  { enabled = true }: { enabled?: boolean } = {},
) => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['paramsetDescription', interfaceName, address, paramsetKey],
    enabled,
    queryFn: async () =>
      (await request({ type: 'getParamsetDescription', interfaceName, address, paramsetKey })).description ?? {},
    staleTime: Infinity,
    // Not every interface has descriptions (e.g. CUxD); show the raw values
    retry: false,
  });
};

// The current values of a paramset (MASTER: the device's settings)
export const useParamset = (
  interfaceName: string,
  address: string,
  paramsetKey: 'VALUES' | 'MASTER',
  { enabled = true, refetchInterval = false }: { enabled?: boolean; refetchInterval?: number | false } = {},
) => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['paramset', interfaceName, address, paramsetKey],
    refetchInterval,
    queryFn: async () =>
      ((await request({ type: 'getParamset', interfaceName, address, paramsetKey })).values ?? {}) as Record<
        string,
        DatapointValue
      >,
    enabled,
    retry: false,
  });
};

// All devices of all interfaces, for the setup area
export const useDevices = () => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['devices'],
    queryFn: async () => (await request({ type: 'listDevices' })).devices ?? [],
  });
};

// Saves changed settings (MASTER) of one device or channel
export const usePutParamset = () => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      interfaceName,
      address,
      values,
    }: {
      interfaceName: string;
      address: string;
      values: Record<string, DatapointValue>;
    }) => {
      await request({ type: 'putParamset', interfaceName, address, paramsetKey: 'MASTER', values }, { queue: false });
    },
    onSettled: (_, __, { interfaceName, address, values }) => {
      // An input's operation mode is also its channel mode, which decides its
      // tile (stored by the server as metadata channelMode)
      if ('CHANNEL_OPERATION_MODE' in values) queryClient.invalidateQueries({ queryKey: ['channels'] });
      return queryClient.invalidateQueries({ queryKey: ['paramset', interfaceName, address] });
    },
  });
};
