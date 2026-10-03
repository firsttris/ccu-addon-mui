import React from 'react';
import { FloorControl } from '../controls/FloorControl';
import { SwitchControl } from '../controls/SwitchControl';
import { BlindsControl } from '../controls/BlindsControl';
import { ThermostatControl } from '../controls/ThermostatControl';
import { DoorControl } from '../controls/DoorControl';
import { GenericControl } from '../controls/GenericControl';
import { Channel, ChannelType, GenericChannel, KnownChannel } from '../types/types';

interface ControlComponentProps {
  channel: Channel;
}

// Memoized: an event creates a new object only for the channel it concerns,
// so all other controls can skip rendering.
export const ControlComponent = React.memo(function ControlComponent({
  channel,
}: ControlComponentProps) {
  // A GenericChannel's type is any string, so it would keep the switch from
  // narrowing; the default case below covers it.
  const known = channel as KnownChannel;
  switch (known.type) {
    case ChannelType.CLIMATECONTROL_FLOOR_TRANSCEIVER:
      return <FloorControl channel={known} />;
    case ChannelType.SWITCH_VIRTUAL_RECEIVER:
      return <SwitchControl channel={known} />;
    case ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER:
      return <ThermostatControl channel={known} />;
    case ChannelType.BLIND_VIRTUAL_RECEIVER:
      return <BlindsControl channel={known} />;
    case ChannelType.KEYMATIC:
      return <DoorControl channel={known} />;
    default:
      // Every other type shows its datapoints as plain values
      return <GenericControl channel={channel as GenericChannel} />;
  }
});
