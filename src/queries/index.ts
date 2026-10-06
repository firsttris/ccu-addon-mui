import { useCallback, useEffect, useMemo, useRef } from 'react';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RequestError, useWebSocketActions } from '../hooks/useWebsocket';
import { AlarmMessage, ServiceMessage, ProgramDefinition } from '../types/protocol';
import { applyEvent, groupChannelsByType, shareGroups, Value } from '../hooks/channels';
import { useToast } from '../contexts/ToastContext';
import { TranslationKey, useTranslations } from '../i18n/utils';
import {
  Channel,
  DatapointValue,
  Device,
  HmEvent,
  InboxDevice,
  Link,
  ParamsetDescription,
  Program,
  SessionInfo,
  Sysvar,
} from '../types/types';

// Server data loaded through TanStack Query. The queryFn sends its request
// over the WebSocket (request() in useWebsocket); after a reconnect all
// queries are invalidated, and events update the cached channels.

// Battery and reachability problems are not pushed by the server
const DEVICE_PROBLEMS_REFRESH_MS = 5 * 60 * 1000;
// The health page: batteries, radio and reachability of all devices
const DEVICE_HEALTH_REFRESH_MS = 60 * 1000;
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
    onSettled: (_, __, { interfaceName, address, values }) => {
      // An input's operation mode is also its channel mode, which decides its
      // tile (stored by the server as metadata channelMode)
      if ('CHANNEL_OPERATION_MODE' in values) queryClient.invalidateQueries({ queryKey: ['channels'] });
      return queryClient.invalidateQueries({ queryKey: ['paramset', interfaceName, address] });
    },
  });
};

// Seconds pairing is still on for an interface (0: off), polled while on
export const useInstallMode = (interfaceName: string, { poll, enabled = true }: { poll: boolean; enabled?: boolean }) => {
  const { request } = useWebSocketActions();
  return useQuery({
    enabled,
    queryKey: ['installMode', interfaceName],
    queryFn: async () => {
      const response = await request({ type: 'getInstallMode', interfaceName });
      // BidCos-RF: a device that failed for another security key
      return { seconds: response.seconds ?? 0, keyMismatch: response.keyMismatch };
    },
    refetchInterval: poll ? 1000 : false,
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
    queryFn: async () => ((await request({ type: 'getInbox' })).devices ?? []) as unknown as InboxDevice[],
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
        ['installMode', 'inbox', 'devices', 'channels'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      ),
  });
};

// Installs the firmware the CCU has delivered to a device
export const useInstallFirmware = () => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ interfaceName, address }: { interfaceName: string; address: string }) => {
      // A BidCos update answers only once the device is flashed (minutes),
      // as the WebUI waits for updateFirmware
      await request({ type: 'installFirmware', interfaceName, address }, { queue: false, timeoutMs: 20 * 60 * 1000 });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
  });
};

// Device firmware on the CCU (/etc/config/firmware), for administrators
export const useDeviceFirmwareFiles = (enabled = true) => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['deviceFirmware'],
    queryFn: async () => (await request({ type: 'getDeviceFirmware' })).files,
    enabled,
    retry: false,
  });
};

// The newest device firmware at eQ-3; the server keeps the list for an
// hour, so asking again is cheap
export const useDeviceFirmwareCatalog = (enabled = true) => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['deviceFirmwareCatalog'],
    queryFn: async () => (await request({ type: 'checkDeviceFirmware' }, { timeoutMs: 30000 })).versions,
    enabled,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
};

// Downloading a device firmware from eQ-3 onto the CCU, or adding an
// uploaded one, takes a while: the HMServer unpacks it, the interface
// processes read it
export const DEVICE_FIRMWARE_TIMEOUT_MS = 3 * 60 * 1000;

// After device firmware was added or deleted: the files and the devices
// (AVAILABLE_FIRMWARE) change
export const useDeviceFirmwareChanged = () => {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['deviceFirmware'] }),
      queryClient.invalidateQueries({ queryKey: ['devices'] }),
    ]);
};

// ReGa sends no events for system variables. After getSysvars the server
// reads them for all apps and sends a 'sysvars' message when they change
// (useWebsocket puts it into this query).
export const useSysvars = () => {
  const { request, recent } = useWebSocketActions();
  return useQuery({
    queryKey: ['sysvars'],
    queryFn: async () => {
      const startedAt = recent.time();
      const sysvars = (await request({ type: 'getSysvars' })).sysvars ?? [];
      // A push that came in meanwhile is newer than the answer
      return (recent.listSince('sysvars', startedAt) ?? sysvars) as Sysvar[];
    },
  });
};

export const usePrograms = () => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['programs'],
    queryFn: async () => ((await request({ type: 'getPrograms' })).programs ?? []) as Program[],
  });
};

export type LogicAction =
  | { type: 'setSysvar'; id: number; value: string | number | boolean }
  | { type: 'runProgram'; id: number }
  | { type: 'setLogicOption'; id: number; option: 'visible' | 'operate'; value: boolean }
  | { type: 'setProgramActive'; id: number; active: boolean };

// Sets a system variable (shown at once), runs a program or switches it
// on or off
export const useLogicAction = () => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: LogicAction) => {
      await request(action, { queue: false });
    },
    onMutate: (action) => {
      if (action.type === 'setSysvar') {
        queryClient.setQueryData<Sysvar[]>(['sysvars'], (sysvars) =>
          sysvars?.map((sv) => (sv.id === action.id ? { ...sv, value: action.value } : sv)),
        );
      }
      if (action.type === 'setLogicOption') {
        const set = <T extends { id: number }>(list?: T[]) =>
          list?.map((item) => (item.id === action.id ? { ...item, [action.option]: action.value } : item));
        queryClient.setQueryData<Program[]>(['programs'], set);
        if (action.option === 'visible') queryClient.setQueryData<Sysvar[]>(['sysvars'], set);
      }
      if (action.type === 'setProgramActive') {
        queryClient.setQueryData<Program[]>(['programs'], (programs) =>
          programs?.map((p) => (p.id === action.id ? { ...p, active: action.active } : p)),
        );
      }
    },
    onSettled: async (_, __, action) => {
      if (action.type === 'setSysvar' || action.type === 'setLogicOption') await queryClient.invalidateQueries({ queryKey: ['sysvars'] });
      if (action.type !== 'setSysvar') await queryClient.invalidateQueries({ queryKey: ['programs'] });
    },
  });
};

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

// Direct links of a device or channel
export const useLinks = (interfaceName: string, address: string) => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['links', interfaceName, address],
    queryFn: async () => ((await request({ type: 'getLinks', interfaceName, address })).links ?? []) as Link[],
    retry: false,
  });
};

// The direct links of all interfaces (setup overview); under 'links', so
// adding or removing one reloads it
export const useAllLinks = () => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['links', 'all'],
    queryFn: async () => (await request({ type: 'getAllLinks' })).links ?? [],
    retry: false,
  });
};

// Parameters of a link on the receiver's side
export const useLinkParamset = (interfaceName: string, receiver: string, sender: string, enabled = true) => {
  const { request } = useWebSocketActions();
  const description = useQuery({
    queryKey: ['linkParamsetDescription', interfaceName, receiver, sender],
    queryFn: async () =>
      ((await request({ type: 'getLinkParamsetDescription', interfaceName, address: receiver, partner: sender }))
        .description ?? {}) as ParamsetDescription,
    staleTime: Infinity,
    retry: false,
    enabled,
  });
  const values = useQuery({
    queryKey: ['linkParamset', interfaceName, receiver, sender],
    queryFn: async () =>
      ((await request({ type: 'getLinkParamset', interfaceName, address: receiver, partner: sender })).values ??
        {}) as Record<string, DatapointValue>,
    retry: false,
    enabled,
  });
  return { description, values };
};

export type LinkAction =
  | { type: 'addLink'; interfaceName: string; sender: string; receiver: string; name: string }
  | { type: 'removeLink'; interfaceName: string; sender: string; receiver: string }
  | {
      type: 'putLinkParamset';
      interfaceName: string;
      address: string;
      partner: string;
      values: Record<string, DatapointValue>;
    };

export const useLinkAction = () => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: LinkAction) => {
      await request(action, { queue: false });
    },
    onSettled: () =>
      Promise.all(['links', 'linkParamset'].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
  });
};

// Logged-in devices (administrators with admin token)
export const useSessions = ({ enabled }: { enabled: boolean }) => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['sessions'],
    queryFn: async () => ((await request({ type: 'listSessions' })).sessions ?? []) as SessionInfo[],
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

export type ConfigChange =
  | { type: 'rename'; address: string; name: string }
  // list says where the group is, for the optimistic update
  | { type: 'setGroupMember'; groupId: number; channelId: number; member: boolean; list: 'rooms' | 'trades' }
  | { type: 'setChannelTile'; id: number; tile: '' | 'light' | 'switch' }
  | { type: 'setChannelOption'; id: number; option: 'visible' | 'usable' | 'logged' | 'aes'; value: boolean };

// The channel field each option is shown in
const optionFields = {
  visible: (value: boolean) => ({ hidden: !value }),
  usable: (value: boolean) => ({ readOnly: !value }),
  logged: (value: boolean) => ({ logged: value }),
  aes: (value: boolean) => ({ aes: value }),
};

// Renames a device or channel, or changes the rooms and trades of a
// channel (setup area, administrators). Memberships show at once and are
// reloaded afterwards in any case.
export const useConfigChange = () => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (change: ConfigChange) => {
      if (change.type === 'setGroupMember') {
        const { list: _list, ...message } = change;
        await request(message, { queue: false });
      } else {
        await request(change, { queue: false });
      }
    },
    onMutate: (change) => {
      if (change.type === 'setChannelOption') {
        queryClient.setQueriesData<Channel[]>({ queryKey: ['channels'] }, (channels) =>
          channels?.map((channel) => (channel.id === change.id ? { ...channel, ...optionFields[change.option](change.value) } : channel)),
        );
        return;
      }
      if (change.type === 'setChannelTile') {
        queryClient.setQueriesData<Channel[]>({ queryKey: ['channels'] }, (channels) =>
          channels?.map((channel) =>
            channel.id === change.id ? { ...channel, tile: change.tile === '' ? undefined : change.tile } : channel,
          ),
        );
        return;
      }
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

export type ObjectChange =
  | { type: 'createGroup'; list: 'rooms' | 'trades'; name: string }
  | { type: 'renameGroup'; list: 'rooms' | 'trades'; id: number; name: string }
  | { type: 'deleteGroup'; list: 'rooms' | 'trades'; id: number }
  | {
      type: 'createSysvar';
      name: string;
      kind: Sysvar['kind'];
      unit?: string;
      min?: number;
      max?: number;
      falseName?: string;
      trueName?: string;
      valueList?: string[];
    }
  | {
      type: 'editSysvar';
      id: number;
      kind: Sysvar['kind'];
      description?: string;
      channel?: number;
      unit?: string;
      min?: number;
      max?: number;
      falseName?: string;
      trueName?: string;
      valueList?: string[];
    }
  | { type: 'renameSysvar'; id: number; name: string }
  | { type: 'deleteSysvar'; id: number };

// Creates, renames or deletes rooms, trades and system variables (setup)
export const useObjectChange = () => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (change: ObjectChange) => request(change, { queue: false }),
    onSettled: (_, __, change) => {
      if ('list' in change) {
        queryClient.invalidateQueries({ queryKey: [change.list] });
        // Channels list the ids of their rooms and trades
        queryClient.invalidateQueries({ queryKey: ['channels'] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['sysvars'] });
      }
    },
  });
};

// The CCU's service messages (unreachable, battery, sticky messages, error
// codes, settings waiting for the device, ...). Loaded once; the server then
// sends them when they change ('serviceMessages'): it reads them again after
// device events of their datapoints, once for all apps.
export const useServiceMessages = () => {
  const { request, recent } = useWebSocketActions();
  return useQuery({
    queryKey: ['serviceMessages'],
    queryFn: async () => {
      const startedAt = recent.time();
      const messages = (await request({ type: 'getServiceMessages' })).messages ?? [];
      return (recent.listSince('serviceMessages', startedAt) ?? messages) as ServiceMessage[];
    },
    staleTime: Infinity,
  });
};

// Triggered alarm variables not yet acknowledged. ReGa sends no events for
// system variables: the server reads them every 15 s for all apps and sends
// them when they change ('alarmMessages').
export const useAlarmMessages = () => {
  const { request, recent } = useWebSocketActions();
  return useQuery({
    queryKey: ['alarmMessages'],
    queryFn: async () => {
      const startedAt = recent.time();
      const alarms = (await request({ type: 'getAlarmMessages' })).alarms ?? [];
      return (recent.listSince('alarmMessages', startedAt) ?? alarms) as AlarmMessage[];
    },
    staleTime: Infinity,
  });
};

// Acknowledges an alarm; it disappears at once
export const useAcknowledgeAlarmMessage = () => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => request({ type: 'acknowledgeAlarmMessage', id }, { queue: false }),
    onMutate: (id) =>
      queryClient.setQueryData<AlarmMessage[]>(['alarmMessages'], (alarms) => alarms?.filter((a) => a.id !== id)),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['alarmMessages'] });
      queryClient.invalidateQueries({ queryKey: ['sysvars'] });
    },
  });
};

// Acknowledges a service message; it disappears at once
export const useAcknowledgeServiceMessage = () => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => request({ type: 'acknowledgeServiceMessage', id }, { queue: false }),
    onMutate: (id) =>
      queryClient.setQueryData<ServiceMessage[]>(['serviceMessages'], (messages) => messages?.filter((m) => m.id !== id)),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceMessages'] });
      queryClient.invalidateQueries({ queryKey: ['deviceProblems'] });
    },
  });
};

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

// The channels of all devices once, without subscribing to their events
// (to pick channels, e.g. for a favorite list)
export const useChannelList = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['channels', { all: true }],
    queryFn: async () => (await request({ type: 'getChannels', all: true })).channels ?? [],
    enabled,
  });
};

// A program with its rules, for the program editor
export const useProgram = (id: number, { enabled = true }: { enabled?: boolean } = {}) => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['program', id],
    queryFn: async () => (await request({ type: 'getProgram', id })).program,
    enabled,
    staleTime: 0,
  });
};

// Saves a program (new if its id is 0) or deletes one
export const useProgramChange = () => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (change: { type: 'saveProgram'; program: ProgramDefinition } | { type: 'deleteProgram'; id: number }) =>
      request(change, { queue: false }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['programs'] }),
        queryClient.invalidateQueries({ queryKey: ['program'] }),
      ]),
  });
};

// The tile layout of a room, trade or favorite list (JSON, '' if none)
export const useLayout = (id: number | undefined) => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['layout', id],
    queryFn: async () => (await request({ type: 'getLayout', id: id ?? 0 })).layout ?? '',
    enabled: id !== undefined && id > 0,
    retry: false,
  });
};

export const useSetLayout = () => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, layout }: { id: number; layout: string }) => request({ type: 'setLayout', id, layout }, { queue: false }),
    onMutate: ({ id, layout }) => queryClient.setQueryData(['layout', id], layout),
    onSettled: (_, __, { id }) => queryClient.invalidateQueries({ queryKey: ['layout', id] }),
  });
};
