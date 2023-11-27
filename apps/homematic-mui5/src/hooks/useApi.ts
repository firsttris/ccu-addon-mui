import axios from 'axios';
import { useQuery, useMutation } from '@tanstack/react-query';
import regaScript from './getAll.tcl';

export enum ChannelType {
  SWITCH_VIRTUAL_RECEIVER = "SWITCH_VIRTUAL_RECEIVER",
  BLIND_VIRTUAL_RECEIVER = "BLIND_VIRTUAL_RECEIVER",
  HEATING_CLIMATECONTROL_TRANSCEIVER = "HEATING_CLIMATECONTROL_TRANSCEIVER"
}

type SwitchVirtualReceiverDatapoint = {
  COMBINED_PARAMETER: string;
  ON_TIME: string;
  PROCESS: string;
  SECTION: string;
  SECTION_STATUS: string;
  STATE: string;
};

type BlindVirtualReceiverDatapoint = {
  ACTIVITY_STATE: string;
  COMBINED_PARAMETER: string;
  LEVEL: string;
  LEVEL_2: string;
  LEVEL_2_STATUS: string;
  LEVEL_STATUS: string;
  PROCESS: string;
  SECTION: string;
  SECTION_STATUS: string;
  STOP: string;
};

type HeatingClimateControlTransceiverDatapoint = {
  ACTIVE_PROFILE: string;
  ACTUAL_TEMPERATURE: string;
  ACTUAL_TEMPERATURE_STATUS: string;
  BOOST_MODE: string;
  BOOST_TIME: string;
  CONTROL_DIFFERENTIAL_TEMPERATURE: string;
  CONTROL_MODE: string;
  DURATION_UNIT: string;
  DURATION_VALUE: string;
  FROST_PROTECTION: string;
  HEATING_COOLING: string;
  HUMIDITY: string;
  HUMIDITY_STATUS: string;
  PARTY_MODE: string;
  PARTY_SET_POINT_TEMPERATURE: string;
  PARTY_TIME_END: string;
  PARTY_TIME_START: string;
  QUICK_VETO_TIME: string;
  SET_POINT_MODE: string;
  SET_POINT_TEMPERATURE: string;
  SWITCH_POINT_OCCURED: string;
  WINDOW_STATE: string;
};

interface BaseChannel {
  id: number;
  name: string;
  address: string;
}

interface SwitchVirtualReceiverChannel extends BaseChannel {
  type: ChannelType.SWITCH_VIRTUAL_RECEIVER;
  datapoints: SwitchVirtualReceiverDatapoint;
}

interface BlindVirtualReceiverChannel extends BaseChannel {
  type: ChannelType.BLIND_VIRTUAL_RECEIVER;
  datapoints: BlindVirtualReceiverDatapoint;
}

interface HeatingClimateControlTransceiverChannel extends BaseChannel {
  type: ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER;
  datapoints: HeatingClimateControlTransceiverDatapoint;
}

type Channel = SwitchVirtualReceiverChannel | BlindVirtualReceiverChannel | HeatingClimateControlTransceiverChannel;

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
  id: number;
  channels: Channel[];
}

// Api

const callApi = async <T>(method: string, params?: any) => {
  return axios.post<Response<T>>('/api/homematic.cgi', {
    method,
    params: { ...params, _session_id_: sessionStorage.getItem('session_id') },
    jsonrpc: '2.0',
  });
};

const login = async (username: string, password: string) => {
  const response = await callApi<string>('Session.login', { username, password });
  sessionStorage.setItem('session_id', response.data.result);
  return response
};

interface SetValue {
  interface: string, address: string, valueKey: string, type: string, value: any
}

const setValue = async (params: SetValue) => {
  await callApi<any>('Interface.setValue', params)
}

export const useGetChannelsForRoom = (roomId?: number) => {
  const useGetRegaRoomsQueryInfo = useGetRegaRooms();
  console.log('all', useGetRegaRoomsQueryInfo.data)
  const room = useGetRegaRoomsQueryInfo.data?.find((room) => room.id === roomId);
  console.log('room', room)
  return { ...useGetRegaRoomsQueryInfo ,data: room };
}

export const useGetRegaRooms = () => useRunScript(regaScript)

export const useRunScript = (script: string) => {
  const api = useApi<string>('ReGa.runScript', { script: script.replace(/\n/g, '') });
  const parsedData = api.data?.data?.result ? JSON.parse(api.data?.data?.result) : [];
  return { isFetched: api.isFetched, isLoading: api.isLoading, data: parsedData as Room[] };
};

export const useApi = <T>(method: string, params?: any) => {
  return useQuery([method], () => callApi<T>(method, params), { retry: false, refetchOnWindowFocus: false, staleTime: 30000 });
};

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
