import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocketActions } from '../hooks/useWebsocket';
import type { Channel, Sysvar } from '../types/types';

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
          channels?.map((channel) =>
            channel.id === change.id ? { ...channel, ...optionFields[change.option](change.value) } : channel,
          ),
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
    mutationFn: async ({ id, layout }: { id: number; layout: string }) =>
      request({ type: 'setLayout', id, layout }, { queue: false }),
    onMutate: ({ id, layout }) => queryClient.setQueryData(['layout', id], layout),
    onSettled: (_, __, { id }) => queryClient.invalidateQueries({ queryKey: ['layout', id] }),
  });
};
