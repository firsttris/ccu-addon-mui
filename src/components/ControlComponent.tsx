import React from 'react';
import styled from '@emotion/styled';
import { FloorControl } from '../controls/FloorControl';
import { SwitchControl } from '../controls/SwitchControl';
import { BlindsControl } from '../controls/BlindsControl';
import { ThermostatControl } from '../controls/ThermostatControl';
import { DoorControl } from '../controls/DoorControl';
import { Channel, ChannelType } from '../types/types';

const ErrorCard = styled.div`
  background-color: #ffebee;
  border: 1px solid #f44336;
  border-radius: 8px;
  padding: 16px;
  margin: 8px;
  color: #c62828;
  font-weight: bold;
`;

interface ControlComponentProps {
  channel: Channel;
}

export const ControlComponent: React.FC<ControlComponentProps> = ({
  channel,
}) => {
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
};
