import axios, { AxiosResponse } from 'axios';
import { useQuery, useMutation } from '@tanstack/react-query';

interface Channel {
  address: string;
  category: string;
  channelType: string;
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

interface Response<T> {
  error: any;
  result: T[];
  version: string;
}

interface Room {
  name: string;
  id: string;
  description: string;
  channelIds: string[]
}

// Api

const callApi = async (method: string, params?: any) => {
  return await axios.post('/api/homematic.cgi', {
    method,
    params: { ...params, _session_id_: sessionStorage.getItem('session_id') },
  });
};

const login = async (username: string, password: string) => {
  const response = await callApi('Session.login', { username, password });
  sessionStorage.setItem('session_id', response.data.result);
};

export const queryDeviceListAllDetail = (): Promise<AxiosResponse<Response<Device>>> => callApi('Device.listAllDetail');

export const queryRoomGetAll = (): Promise<AxiosResponse<Response<Room>>> => callApi('Room.getAll')


// useQuery

export const useChannelForRoom = (roomId?: string) => {
  const getRoomsQueryInfo = useGetRooms()
  const listAllDetailQueryInfo = useListAllDetail()
  const channelIds = getRoomsQueryInfo.data?.data.result.find(room => room.id === roomId)?.channelIds
  const allChannels = listAllDetailQueryInfo.data?.data.result?.flatMap(item => item.channels)
  const channelsForRoom = allChannels?.filter(value => channelIds?.includes(value.id))
  return {
    channelsForRoom,
    isFetched: getRoomsQueryInfo.isFetched && listAllDetailQueryInfo.isFetched
  }
}


export const useApi = (method: string, params?: any) => {
  return useQuery([method, params], () => callApi(method, params));
};


export const useListAllDetail = () => {
  return useQuery(['Device.listAllDetail'], queryDeviceListAllDetail);
};

export const useGetRooms = () => {
  return useQuery(['Room.getAll'], ({queryKey: [method]}): Promise<AxiosResponse<Response<Room>>> => callApi(method));
}

export const useLogin = () => {
  return useMutation({
    mutationFn: (credentials: { username: string; password: string }) => {
      const { username, password } = credentials;
      return login(username, password);
    },
  });
};
