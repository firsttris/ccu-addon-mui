import axios from 'axios';
import { useQuery, useMutation } from '@tanstack/react-query';
import regaGetRoomsScript from './../rega/getRooms.tcl';
import regaGetChannelsScript from './../rega/getChannelsForRoomId.tcl';
import { useCheckSession } from './useCheckSession';
import { useMemo } from 'react';
import { Channel, ChannelType } from 'src/types/types';

interface Room {
  name: string;
  id: number;
  channels: Channel[];
}

interface Error {
  name: string;
  code: number;
  message: string;
}

interface Response<T> {
  error: Error;
  result: T;
  version: string;
}

const SessionIdName = 'ccu_addom-mui_session_id';

export const getSessionId = () => localStorage.getItem(SessionIdName);
export const removeSessionId = () => localStorage.removeItem(SessionIdName);

const callApi = async <T>(method: string, params?: object) => {
  const response = await axios.post<Response<T>>('/api/homematic.cgi', {
    method,
    params: { ...params, _session_id_: getSessionId() },
    jsonrpc: '2.0',
  });

  if (response.data.error) {
    throw new Error((response.data.error as Error).message);
  }

  return response.data.result;
};

const login = async (username: string, password: string) => {
  const response = await callApi<string>('Session.login', {
    username,
    password,
  });
  localStorage.setItem(SessionIdName, response);
  return response;
};

interface SetValue {
  interface: string;
  address: string;
  valueKey: string;
  type: string;
  value: unknown;
}

const setValue = async (params: SetValue) =>
  callApi<void>('Interface.setValue', params);

export const useListInterfaces = () =>
  useApi<string[]>('Interface.listInterfaces');

export const useGetChannelsForRoom = (roomId?: number) =>
  useRunScript<Channel[]>(
    regaGetChannelsScript.replace(
      /ROOMID_PLACEHOLDER/g,
      roomId ? roomId.toString() : 'NO_ROOM_ID'
    )
  );

export const useGetChannelForType = (roomId?: number) => {
  const { data: channelsForRoom, ...otherOptions } =
    useGetChannelsForRoom(roomId);
  const channelsPerType = useMemo(() => {
    return channelsForRoom?.reduce((acc, channel) => {
      const channels = acc.get(channel.type);

      if (channels) {
        channels.push(channel);
      } else {
        acc.set(channel.type, [channel]);
      }

      return acc;
    }, new Map<ChannelType, Channel[]>());
  }, [channelsForRoom]);
  return { ...otherOptions, data: Array.from(channelsPerType) };
};

export const useGetValue = (address: string, valueKey: string) =>
  useApi<string>(
    'Interface.getValue',
    { interface: 'HmIP-RF', address, valueKey },
    { enabled: false }
  );

export const useGetRegaRooms = () => useRunScript<Room[]>(regaGetRoomsScript);

export const useRunScript = <T>(script: string) => {
  const result = useApi<string>('ReGa.runScript', {
    script: script.replace(/\n/g, ''),
  });
  const parsedData = result.data ? JSON.parse(result.data) : [];
  return { ...result, data: parsedData as T };
};

interface Options {
  enabled?: boolean;
}

export const useApi = <T>(method: string, params?: object, options?: Options) => {
  const result = useQuery({
    queryKey: [method, params],
    queryFn: () => callApi<T>(method, params),
    retry: false,
    staleTime: 30000,
    refetchInterval: 120000,
    refetchOnWindowFocus: true,
    ...options,
  });
  useCheckSession(result.isError, result.error as Error);
  return result;
};

export const useSetValueMutation = () => {
  return useMutation({
    mutationFn: (value: SetValue) => {
      return setValue(value);
    },
  });
};

interface Credentials {
  username: string;
  password: string;
}

export const useLogin = () => {
  return useMutation({
    mutationFn: ({ username, password }: Credentials) => {
      return login(username, password);
    },
  });
};
