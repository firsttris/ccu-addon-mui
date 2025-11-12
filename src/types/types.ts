export enum ChannelType {
  SWITCH_VIRTUAL_RECEIVER = 'SWITCH_VIRTUAL_RECEIVER',
  BLIND_VIRTUAL_RECEIVER = 'BLIND_VIRTUAL_RECEIVER',
  HEATING_CLIMATECONTROL_TRANSCEIVER = 'HEATING_CLIMATECONTROL_TRANSCEIVER',
  CLIMATECONTROL_FLOOR_TRANSCEIVER = 'CLIMATECONTROL_FLOOR_TRANSCEIVER',
  KEYMATIC = 'KEYMATIC',
}

export type SwitchVirtualReceiverDatapoint = {
  PROCESS: number;
  SECTION: number;
  SECTION_STATUS: number;
  STATE: boolean;
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
  ACTIVE_PROFILE: number;
  ACTUAL_TEMPERATURE: number;
  ACTUAL_TEMPERATURE_STATUS: number;
  BOOST_MODE: boolean;
  BOOST_TIME: number;
  FROST_PROTECTION: boolean;
  HEATING_COOLING: number;
  HUMIDITY?: number;
  HUMIDITY_STATUS?: number;
  PARTY_MODE: boolean;
  PARTY_SET_POINT_TEMPERATURE: number;
  QUICK_VETO_TIME: number;
  SET_POINT_MODE: number;
  SET_POINT_TEMPERATURE: number;
  SWITCH_POINT_OCCURED: boolean;
  WINDOW_STATE: number;
  LEVEL?: number;
  LEVEL_STATUS?: number;
  VALVE_STATE?: number;
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

export type RainDesctionTransmitterDatapoint = {
  RAINING: string;
  HEATER_STATE: string;
};

export type KeymaticDatapoint = {
  ERROR: string;
  INHIBIT: string;
  OPEN: boolean;
  RELOCK_DELAY: string;
  STATE: boolean;
  STATE_UNCERTAIN: boolean;
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
  datapoints: FloorClimateControlTransceiverDatapoint;
}

export interface KeymaticChannel extends BaseChannel {
  type: ChannelType.KEYMATIC;
  datapoints: KeymaticDatapoint;
}

export type Channel =
  | SwitchVirtualReceiverChannel
  | BlindVirtualReceiverChannel
  | HeatingClimateControlTransceiverChannel
  | FloorClimateControlTransceiverChannel
  | KeymaticChannel;

export interface Room {
  name: string;
  id: number;
}

export interface Trade {
  id: number;
  name: string;
}

export interface HmEvent {
  channel: string;
  datapoint: string;
  value: string | number | boolean;
}
