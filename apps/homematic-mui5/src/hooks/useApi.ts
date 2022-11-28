import axios from 'axios';
import { useQuery, useMutation } from '@tanstack/react-query';

export enum ChannelType {
  SWITCH_VIRTUAL_RECEIVER = "SWITCH_VIRTUAL_RECEIVER",
  BLIND_VIRTUAL_RECEIVER = "BLIND_VIRTUAL_RECEIVER",
  HEATING_CLIMATECONTROL_TRANSCEIVER = "HEATING_CLIMATECONTROL_TRANSCEIVER"
}

interface Channel {
  address: string;
  category: string;
  channelType: ChannelType;
  deviceId: string;
  id: string;
  index: number;
  isAesAvailable: boolean;
  isEventable: boolean;
  isLogable: boolean;
  isLogged: boolean;
  isReadable: boolean;
  isReady: boolean;
  isUsable: boolean;
  isVirtual: boolean;
  isVisible: boolean;
  isWritable: boolean;
  mode: string;
  name: string;
  partnerId: string;
}

interface Device {
  address: string;
  channels: Channel[]
  id: string;
  interface: string;
  isReady: boolean;
  name: string;
  operateGroupOnly: string;
  type: string;
}

interface Error {
  name: string;
  code: number;
  message: string
}

interface Response<T> {
  error: Error;
  result: T;
  version: string;
}

interface Room {
  name: string;
  id: string;
  description: string;
  channelIds: string[]
}

// Api

const callApi = async <T>(method: string, params?: any) => {
  return await axios.post<Response<T>>('/api/homematic.cgi', {
    method,
    params: { ...params, _session_id_: sessionStorage.getItem('session_id') },
  });
};

const login = async (username: string, password: string) => {
  const response = await callApi<string>('Session.login', { username, password });
  sessionStorage.setItem('session_id', response.data.result);
  return response
};

interface SetValue {
  address: string, valueKey: string, type: string, value: any
}

const setValue = async (value: SetValue) => {
  await callApi<any>('Interface.setValue', { interface: "HmIP-RF", ...value })
}

// useQuery

export const useChannelForRoom = (channelIds?: string[]) => {
  const listAllDetailQueryInfo = useGetAllDeviceDetails()
  const allChannels = listAllDetailQueryInfo.data?.data.result?.flatMap(item => item.channels)
  const channelsForRoom = allChannels?.filter(value => channelIds?.includes(value.id))
  return {
    channelsForRoom,
    isFetched: listAllDetailQueryInfo.isFetched,
    isLoading: listAllDetailQueryInfo.isLoading
  }
}


export const useApi = <T>(method: string, params?: any) => {
  return useQuery([method, params], () => callApi<T>(method, params));
};

export const useGetAllDeviceDetails = () => useApi<Device[]>('Device.listAllDetail')

export const useGetRooms = () => useApi<Room[]>('Room.getAll')

export const useGetValue = (address: string, valueKey: string) => useApi<string>('Interface.getValue', { interface: "HmIP-RF", address, valueKey})

export const useGetParamSet = <T>(address: string) => useApi<T>('Interface.getParamset', { interface: "HmIP-RF", address, paramsetKey: "VALUES"})


export const useSetValueMutation = () => {
  return useMutation({
    mutationFn: (value: SetValue) =>{
      return setValue(value)
    }
  })
}

interface Credentials {
  username: string
  password: string
}

export const useLogin = () => {
  return useMutation({
    mutationFn: ({ username, password }: Credentials) => {
      return login(username, password);
    },
  });
};
