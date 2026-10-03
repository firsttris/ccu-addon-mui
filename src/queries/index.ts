import { useCallback, useEffect, useMemo } from 'react';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RequestError, useWebSocketActions } from '../hooks/useWebsocket';
import { applyEvent, groupChannelsByType, Value } from '../hooks/channels';
import { useToast } from '../contexts/ToastContext';
import { TranslationKey, useTranslations } from '../i18n/utils';
import { Channel, DatapointValue, Device, HmEvent, ParamsetDescription } from '../types/types';

// Server data loaded through TanStack Query. The queryFn sends its request
// over the WebSocket (request() in useWebsocket); after a reconnect all
// queries are invalidated, and events update the cached channels.

// Battery and reachability problems are not pushed by the server
const DEVICE_PROBLEMS_REFRESH_MS = 5 * 60 * 1000;
const SET_DATAPOINT_TIMEOUT_MS = 15000;

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

export const useDeviceProblems = () => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['deviceProblems'],
    queryFn: async () => (await request({ type: 'getDeviceProblems' })).devices ?? [],
    refetchInterval: DEVICE_PROBLEMS_REFRESH_MS,
  });
};

// What the parameters of a channel are (type, range, unit, writable). Only
// changes with new firmware, so it is never refetched.
export const useParamsetDescription = (
  interfaceName: string,
  address: string,
  paramsetKey: 'VALUES' | 'MASTER' = 'VALUES',
) => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['paramsetDescription', interfaceName, address, paramsetKey],
    queryFn: async () =>
      ((await request({ type: 'getParamsetDescription', interfaceName, address, paramsetKey }))
        .description ?? {}) as ParamsetDescription,
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
  { enabled = true }: { enabled?: boolean } = {},
) => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['paramset', interfaceName, address, paramsetKey],
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
    queryFn: async () => ((await request({ type: 'listDevices' })).devices ?? []) as unknown as Device[],
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
    onSettled: (_, __, { interfaceName, address }) =>
      queryClient.invalidateQueries({ queryKey: ['paramset', interfaceName, address] }),
  });
};

export type ConfigChange =
  | { type: 'rename'; address: string; name: string }
  // list says where the group is, for the optimistic update
  | { type: 'setGroupMember'; groupId: number; channelId: number; member: boolean; list: 'rooms' | 'trades' };

// Renames a device or channel, or changes the rooms and trades of a
// channel (setup area, administrators). Memberships show at once and are
// reloaded afterwards in any case.
export const useConfigChange = () => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (change: ConfigChange) => {
      const message = change.type === 'setGroupMember' ? { ...change, list: undefined } : change;
      await request(message, { queue: false });
    },
    onMutate: (change) => {
      if (change.type !== 'setGroupMember') {
        return;
      }
      queryClient.setQueriesData<Channel[]>({ queryKey: ['channels'] }, (channels) =>
        channels?.map((channel) => {
          if (channel.id !== change.channelId) {
            return channel;
          }
          const ids = (channel[change.list] ?? []).filter((id) => id !== change.groupId);
          return { ...channel, [change.list]: change.member ? [...ids, change.groupId] : ids };
        }),
      );
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['channels'] }),
        queryClient.invalidateQueries({ queryKey: ['devices'] }),
      ]),
  });
};

export type ChannelsRequest = { roomId: string } | { tradeId: string } | { all: true };

// The channels of a room, a trade or all devices, kept up to date by
// events, grouped by type in display order.
export const useChannels = (channelsRequest: ChannelsRequest) => {
  const { request, subscribe } = useWebSocketActions();
  const query = useQuery({
    queryKey: ['channels', channelsRequest],
    queryFn: async () =>
      (await request({ type: 'getChannels', ...channelsRequest })).channels ?? [],
    // Events only arrive for the channels shown; a cached list of another
    // room is shown right away but reloaded.
    staleTime: 0,
  });
  const channels = query.data;

  // Subscribe to the channels and their maintenance channels (battery,
  // reachability). Only when the addresses change, not on every value.
  const addressesKey = useMemo(() => {
    const addresses = new Set<string>();
    for (const channel of channels ?? []) {
      addresses.add(channel.address);
      if (channel.statusAddress) {
        addresses.add(channel.statusAddress);
      }
    }
    return Array.from(addresses).join('\n');
  }, [channels]);

  useEffect(() => {
    if (addressesKey !== '') {
      subscribe(addressesKey.split('\n'));
    }
  }, [addressesKey, subscribe]);

  const channelsByType = useMemo(() => groupChannelsByType(channels ?? []), [channels]);
  return { ...query, channelsByType };
};

const applyToChannels = (
  queryClient: QueryClient,
  event: HmEvent,
  onlyIfCurrent?: { value: Value },
) =>
  queryClient.setQueriesData<Channel[]>({ queryKey: ['channels'] }, (channels) =>
    channels ? applyEvent(channels, event, onlyIfCurrent) : channels,
  );

const currentValue = (queryClient: QueryClient, address: string, datapoint: string) => {
  for (const [, channels] of queryClient.getQueriesData<Channel[]>({ queryKey: ['channels'] })) {
    const channel = channels?.find((c) => c.address === address);
    if (channel) {
      return (channel.datapoints as Record<string, unknown>)[datapoint] as Value | undefined;
    }
  }
  return undefined;
};

const setErrorMessages: Record<string, TranslationKey> = {
  NOT_CONNECTED: 'NOT_CONNECTED',
  UNREACH: 'SET_UNREACH',
  TIMEOUT: 'SET_TIMEOUT',
  FORBIDDEN: 'SET_FORBIDDEN',
};

interface SetDatapoint {
  interfaceName: string;
  address: string;
  attribute: string;
  value: Value;
}

// Returns setDataPoint(interfaceName, address, attribute, value). The value
// is shown right away and rolled back with a message if the CCU reports an
// error (or nothing).
export const useSetDataPoint = () => {
  const queryClient = useQueryClient();
  const { request } = useWebSocketActions();
  const { showToast } = useToast();
  const t = useTranslations();

  const { mutate } = useMutation({
    mutationFn: async ({ interfaceName, address, attribute, value }: SetDatapoint) => {
      const response = await request(
        { type: 'setDatapoint', interfaceName, address, attribute, value },
        { queue: false, timeoutMs: SET_DATAPOINT_TIMEOUT_MS },
      );
      if (!response.success) {
        throw new RequestError(response.error ?? 'setDatapoint failed', response.code);
      }
    },
    onMutate: ({ address, attribute, value }) => {
      const previous = currentValue(queryClient, address, attribute);
      applyToChannels(queryClient, { channel: address, datapoint: attribute, value });
      return { previous };
    },
    onError: (error, { address, attribute, value }, context) => {
      if (context?.previous !== undefined) {
        // Not if an event has brought in another value since
        applyToChannels(
          queryClient,
          { channel: address, datapoint: attribute, value: context.previous },
          { value },
        );
      }
      const code = error instanceof RequestError ? error.code : undefined;
      showToast(t(setErrorMessages[code ?? ''] ?? 'SET_FAILED'));
    },
  });

  return useCallback(
    (interfaceName: string, address: string, attribute: string, value: Value) =>
      mutate({ interfaceName, address, attribute, value }),
    [mutate],
  );
};
