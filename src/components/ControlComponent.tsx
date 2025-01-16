import React from 'react';
import { FloorControl } from '../controls/FloorControl';
import { SwitchControl } from '../controls/SwitchControl';
import { BlindsControl } from '../controls/BlindsControl';
import { ThermostatControl } from '../controls/ThermostatControl';
import { DoorControl } from '../controls/DoorControl';
import { Channel, ChannelType } from '../types/types';

interface ControlComponentProps {
  channel: Channel;
}

export const ControlComponent: React.FC<ControlComponentProps> = ({ channel }) => {
  switch (channel.type) {
    case ChannelType.CLIMATECONTROL_FLOOR_TRANSCEIVER:
      return <FloorControl channel={channel} />;
    case ChannelType.SWITCH_VIRTUAL_RECEIVER:
      return <SwitchControl channel={channel} />;
    case ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER:
      return <ThermostatControl channel={channel} />;
    case ChannelType.BLIND_VIRTUAL_RECEIVER:
      return <BlindsControl channel={channel} />;
    case ChannelType.KEYMATIC:
      return <DoorControl channel={channel} />;
    default:
      console.error(`${(channel as any).type} not implemented`);
      return null;
  }
};