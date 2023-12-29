export enum ChannelType {
  SWITCH_VIRTUAL_RECEIVER = 'SWITCH_VIRTUAL_RECEIVER',
  BLIND_VIRTUAL_RECEIVER = 'BLIND_VIRTUAL_RECEIVER',
  HEATING_CLIMATECONTROL_TRANSCEIVER = 'HEATING_CLIMATECONTROL_TRANSCEIVER',
  CLIMATECONTROL_FLOOR_TRANSCEIVER = 'CLIMATECONTROL_FLOOR_TRANSCEIVER',
  RAIN_DETECTION_TRANSMITTER = 'RAIN_DETECTION_TRANSMITTER',
  KEYMATIC = 'KEYMATIC',
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
  HUMIDITY?: string;
  HUMIDITY_STATUS?: string;
  PARTY_MODE: string;
  PARTY_SET_POINT_TEMPERATURE: string;
  PARTY_TIME_END: string;
  PARTY_TIME_START: string;
  QUICK_VETO_TIME: string;
  SET_POINT_MODE: string;
  SET_POINT_TEMPERATURE: string;
  SWITCH_POINT_OCCURED: string;
  WINDOW_STATE: string;
  LEVEL?: string;
  LEVEL_STATUS?: string;
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
  OPEN: string;
  RELOCK_DELAY: string;
  STATE: string;
  STATE_UNCERTAIN: string;
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

export interface RainDetectionTransmitterChannel extends BaseChannel {
  type: ChannelType.RAIN_DETECTION_TRANSMITTER;
  datapoints: RainDesctionTransmitterDatapoint;
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
  | RainDetectionTransmitterChannel
  | KeymaticChannel;
