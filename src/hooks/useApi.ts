import axios from 'axios';
import { useQuery, useMutation } from '@tanstack/react-query';
import regaGetRoomsScript from './../rega/getRooms.tcl';
import regaGetChannelsScript from './../rega/getChannelsForRoomId.tcl';
import { useCheckSession } from './useCheckSession';

export enum ChannelType {
  SWITCH_VIRTUAL_RECEIVER = "SWITCH_VIRTUAL_RECEIVER",
  BLIND_VIRTUAL_RECEIVER = "BLIND_VIRTUAL_RECEIVER",
  HEATING_CLIMATECONTROL_TRANSCEIVER = "HEATING_CLIMATECONTROL_TRANSCEIVER",
  CLIMATECONTROL_FLOOR_TRANSCEIVER = "CLIMATECONTROL_FLOOR_TRANSCEIVER"
}

export type SwitchVirtualReceiverDatapoint = {
  COMBINED_PARAMETER: string;
  ON_TIME: string;
  PROCESS: string;
  SECTION: string;
  SECTION_STATUS: string;
  STATE: string;
};

export type BlindVirtualReceiverDatapoint = {
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

export type HeatingClimateControlTransceiverDatapoint = {
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

export type FloorClimateControlTransceiverDatapoint = {
  DEW_POINT_ALARM: string;
  EMERGENCY_OPERATION: string;
  EXTERNAL_CLOCK: string;
  FROST_PROTECTION: string;
  HUMIDITY_LIMITER: string;
  LEVEL: string;
  LEVEL_STATUS: string;
  VALVE_STATE: string;
};

interface BaseChannel {
  id: number;
  name: string;
  address: string;
  interfaceName: string;
}

export interface SwitchVirtualReceiverChannel extends BaseChannel {
  type: ChannelType.SWITCH_VIRTUAL_RECEIVER;
  datapoints: SwitchVirtualReceiverDatapoint;
}

export interface BlindVirtualReceiverChannel extends BaseChannel {
  type: ChannelType.BLIND_VIRTUAL_RECEIVER;
  datapoints: BlindVirtualReceiverDatapoint;
}

export interface HeatingClimateControlTransceiverChannel extends BaseChannel {
  type: ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER;
  datapoints: HeatingClimateControlTransceiverDatapoint;
}

export interface FloorClimateControlTransceiverChannel extends BaseChannel {
  type: ChannelType.CLIMATECONTROL_FLOOR_TRANSCEIVER;
  datapoints: FloorClimateControlTransceiverDatapoint
}

export type Channel = SwitchVirtualReceiverChannel | BlindVirtualReceiverChannel | HeatingClimateControlTransceiverChannel | FloorClimateControlTransceiverChannel;

interface Room {
  name: string;
  id: number;
  channels: Channel[];
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



export const getSessionId = () => localStorage.getItem('session_id');
export const removeSessionId = () => localStorage.removeItem('session_id');

const callApi = async <T>(method: string, params?: any) => {
    const response = await axios.post<Response<T>>('/api/homematic.cgi', {
      method,
      params: { ...params, _session_id_: getSessionId() },
      jsonrpc: '2.0',
    });

    if (response.data.error) {
      throw new Error((response.data.error as Error).message);
    }

    return response.data.result;
}

const login = async (username: string, password: string) => {
  const response = await callApi<string>('Session.login', { username, password });
  localStorage.setItem('session_id', response);
  return response;
};

interface SetValue {
  interface: string, address: string, valueKey: string, type: string, value: any
}

const setValue = async (params: SetValue) => callApi<any>('Interface.setValue', params)

export const listInterfaces = () => useApi<string[]>('Interface.listInterfaces');

export const useGetChannelsForRoom = (roomId?: number) => useRunScript<Channel[]>(regaGetChannelsScript.replace(/ROOMID_PLACEHOLDER/g, roomId ? roomId.toString() : 'NO_ROOM_ID'));

export const useGetValue = (address: string, valueKey: string) => useApi<string>('Interface.getValue', { interface: "HmIP-RF", address, valueKey}, { enabled: false })

export const useGetRegaRooms = () => useRunScript<Room[]>(regaGetRoomsScript)

export const useRunScript = <T>(script: string) => {
  const result = useApi<string>('ReGa.runScript', { script: script.replace(/\n/g, '') });
  const parsedData = result.data ? JSON.parse(result.data) : [];
  return { ...result, data: parsedData as T };
};

interface Options {
  enabled?: boolean;
}

export const useApi = <T>(method: string, params?: any, options?: Options) => {
  const result = useQuery([method, params], () => callApi<T>(method, params), { retry: false, refetchOnWindowFocus: false, staleTime: 30000, ...options });
  useCheckSession(result.isError, result.error as Error);
  return result;
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
