import { ComponentType } from 'react';
import { Channel, ChannelType } from '../types/types';
import { FloorControl } from './FloorControl';
import { SwitchControl } from './SwitchControl';
import { BlindsControl } from './BlindsControl';
import { ThermostatControl } from './ThermostatControl';
import { DoorControl, DoorLockControl } from './DoorControl';
import { EnergyMeterControl } from './EnergyMeterControl';
import { WindowControl } from './WindowControl';
import { ClimateSensorControl } from './ClimateSensorControl';
import { DimmerControl } from './DimmerControl';
import { ColorLightControl } from './ColorLightControl';
import { ButtonsControl } from './ButtonsControl';

// Sections of the dashboard, in the order they are shown
export type SectionId = 'climate' | 'floor' | 'lights' | 'blinds' | 'windows' | 'doors' | 'sensors' | 'buttons' | 'energy';

// Hand-made controls for common channel types. They refine the generic
// renderer (GenericControl), which every other type falls back to.
export type ControlOverride = (
  // One tile per channel
  | { per: 'channel'; component: ComponentType<{ channel: Channel }> }
  // One tile for all channels of a device of this type (e.g. the four
  // channels of an energy meter)
  | { per: 'device'; component: ComponentType<{ channels: Channel[] }> }
) & { section: SectionId };

const channelControl = <T extends Channel>(
  section: SectionId,
  component: ComponentType<{ channel: T }>,
): ControlOverride => ({
  per: 'channel',
  section,
  component: component as ComponentType<{ channel: Channel }>,
});

const deviceControl = <T extends Channel>(
  section: SectionId,
  component: ComponentType<{ channels: T[] }>,
): ControlOverride => ({
  per: 'device',
  section,
  component: component as ComponentType<{ channels: Channel[] }>,
});

export const controlOverrides: Partial<Record<string, ControlOverride>> = {
  [ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER]: channelControl('climate', ThermostatControl),
  [ChannelType.CLIMATECONTROL_FLOOR_TRANSCEIVER]: channelControl('floor', FloorControl),
  [ChannelType.SWITCH_VIRTUAL_RECEIVER]: channelControl('lights', SwitchControl),
  [ChannelType.BLIND_VIRTUAL_RECEIVER]: channelControl('blinds', BlindsControl),
  // HmIP shutter actuators and the BidCos actuators work the same way
  SHUTTER_VIRTUAL_RECEIVER: channelControl('blinds', BlindsControl),
  BLIND: channelControl('blinds', BlindsControl),
  SWITCH: channelControl('lights', SwitchControl),
  DIMMER_VIRTUAL_RECEIVER: channelControl('lights', DimmerControl),
  DIMMER: channelControl('lights', DimmerControl),
  UNIVERSAL_LIGHT_RECEIVER: channelControl('lights', ColorLightControl),
  [ChannelType.KEYMATIC]: channelControl('doors', DoorControl),
  DOOR_LOCK_STATE_TRANSMITTER: channelControl('doors', DoorLockControl),
  DOOR_LOCK_TRANSCEIVER: channelControl('doors', DoorLockControl),
  [ChannelType.ENERGIE_METER_TRANSMITTER]: deviceControl('energy', EnergyMeterControl),
  SHUTTER_CONTACT: channelControl('windows', WindowControl),
  SHUTTER_CONTACT_TRANSCEIVER: channelControl('windows', WindowControl),
  ROTARY_HANDLE_SENSOR: channelControl('windows', WindowControl),
  ROTARY_HANDLE_TRANSCEIVER: channelControl('windows', WindowControl),
  CLIMATE_TRANSCEIVER: channelControl('sensors', ClimateSensorControl),
  WEATHER_TRANSMIT: channelControl('sensors', ClimateSensorControl),
  WEATHER: channelControl('sensors', ClimateSensorControl),
  HEATING_ROOM_TH_TRANSCEIVER: channelControl('sensors', ClimateSensorControl),
  [ChannelType.KEY_TRANSCEIVER]: deviceControl('buttons', ButtonsControl),
  KEY: deviceControl('buttons', ButtonsControl),
  VIRTUAL_KEY: deviceControl('buttons', ButtonsControl),
};
