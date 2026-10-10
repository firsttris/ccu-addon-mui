import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RequestError, useWebSocketActions } from '../hooks/useWebsocket';
import { applyEvent, groupChannelsByType, shareGroups, type Value } from '../hooks/channels';
import { useToast } from '../contexts/ToastContext';
import { m } from '../paraglide/messages';
import type { Channel, HmEvent } from '../types/types';

const SET_DATAPOINT_TIMEOUT_MS = 15000;

export type ChannelsRequest = { roomId: string } | { tradeId: string } | { favoriteId: string } | { all: true };

// The channels of a room, a trade, a favorite list or all devices, kept up to date by
// events, grouped by type in display order.
export const useChannels = (channelsRequest: ChannelsRequest) => {
  const { request, subscribe, recent } = useWebSocketActions();
  const query = useQuery({
    queryKey: ['channels', channelsRequest],
    queryFn: async () => {
      const startedAt = recent.time();
      const channels = (await request({ type: 'getChannels', ...channelsRequest })).channels ?? [];
      // Events that came in meanwhile are newer than the answer
      return recent.channelsSince(channels, startedAt);
    },
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

  // Channels the WebUI's option "sichtbar" hides stay out of the views. The
  // groups an event didn't touch stay the same arrays, so their tiles and
  // grids don't render again.
  const previousGroups = useRef<[string, Channel[]][]>([]);
  const channelsByType = useMemo(() => {
    const groups = shareGroups(previousGroups.current, groupChannelsByType((channels ?? []).filter((c) => !c.hidden)));
    previousGroups.current = groups;
    return groups;
  }, [channels]);
  return { ...query, channelsByType };
};

const applyToChannels = (queryClient: QueryClient, event: HmEvent, onlyIfCurrent?: { value: Value }) =>
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

// Functions, not keys: a lookup by key (i18n/utils) would put every text of
// the app in the start bundle
const setErrorMessages: Record<string, () => string> = {
  NOT_CONNECTED: m.NOT_CONNECTED,
  TIMEOUT: m.SET_TIMEOUT,
  FORBIDDEN: m.SET_FORBIDDEN,
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
        applyToChannels(queryClient, { channel: address, datapoint: attribute, value: context.previous }, { value });
      }
      const code = error instanceof RequestError ? error.code : undefined;
      showToast((setErrorMessages[code ?? ''] ?? m.SET_FAILED)());
    },
  });

  return useCallback(
    (interfaceName: string, address: string, attribute: string, value: Value) =>
      mutate({ interfaceName, address, attribute, value }),
    [mutate],
  );
};
