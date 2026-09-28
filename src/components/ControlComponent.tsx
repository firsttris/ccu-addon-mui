import React from 'react';
import styled from '@emotion/styled';
import { FloorControl } from '../controls/FloorControl';
import { SwitchControl } from '../controls/SwitchControl';
import { BlindsControl } from '../controls/BlindsControl';
import { ThermostatControl } from '../controls/ThermostatControl';
import { DoorControl } from '../controls/DoorControl';
import { Channel, ChannelType } from '../types/types';

const ErrorCard = styled.div`
  background-color: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 8px;
  padding: 16px;
  margin: 8px;
  color: ${props => props.theme.colors.text};
  font-weight: bold;
`;

interface ControlComponentProps {
  channel: Channel;
}

// Memoized: an event creates a new object only for the channel it concerns,
// so all other controls can skip rendering.
export const ControlComponent = React.memo(function ControlComponent({
  channel,
}: ControlComponentProps) {
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
      return (
        <ErrorCard>
          <div>Unsupported Channel</div>
          <pre style={{ fontSize: '12px', marginTop: '8px' }}>
            {JSON.stringify(channel, null, 2)}
          </pre>
        </ErrorCard>
      );
  }
});
