import { ComponentType } from 'react';
import { Channel, ChannelType, KnownChannel } from '../types/types';
import { FloorControl } from './FloorControl';
import { SwitchControl } from './SwitchControl';
import { BlindsControl } from './BlindsControl';
import { ThermostatControl } from './ThermostatControl';
import { DoorControl } from './DoorControl';
import { EnergyMeterControl } from './EnergyMeterControl';

// Hand-made controls for common channel types. They refine the generic
// renderer (GenericControl), which every other type falls back to.
export type ControlOverride =
  // One card per channel
  | { per: 'channel'; component: ComponentType<{ channel: Channel }> }
  // One card for all channels of a device of this type (e.g. the four
  // channels of an energy meter)
  | { per: 'device'; component: ComponentType<{ channels: Channel[] }> };

const channelControl = <T extends KnownChannel>(component: ComponentType<{ channel: T }>): ControlOverride => ({
  per: 'channel',
  component: component as ComponentType<{ channel: Channel }>,
});

const deviceControl = <T extends KnownChannel>(component: ComponentType<{ channels: T[] }>): ControlOverride => ({
  per: 'device',
  component: component as ComponentType<{ channels: Channel[] }>,
});

export const controlOverrides: Partial<Record<string, ControlOverride>> = {
  [ChannelType.CLIMATECONTROL_FLOOR_TRANSCEIVER]: channelControl(FloorControl),
  [ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER]: channelControl(ThermostatControl),
  [ChannelType.SWITCH_VIRTUAL_RECEIVER]: channelControl(SwitchControl),
  [ChannelType.BLIND_VIRTUAL_RECEIVER]: channelControl(BlindsControl),
  [ChannelType.KEYMATIC]: channelControl(DoorControl),
  [ChannelType.ENERGIE_METER_TRANSMITTER]: deviceControl(EnergyMeterControl),
};
