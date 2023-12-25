import {
  Box,
  Container,
  Divider,
  LinearProgress,
  List,
  ListItem,
  Typography,
} from '@mui/material';
import { useParams } from 'react-router-dom';
import { Channel, ChannelType, useGetChannelsForRoom } from '../hooks/useApi';
import { BlindsControl } from './BlindsControl';
import { LightControl } from './LightControl';
import { ThermostatControl } from './ThermostatControl';
import { FloorControl } from './FloorControl';
import { useMemo } from 'react';

export const Room = () => {
  const { roomId } = useParams<{ roomId: string }>();

  const { data: channelsForRoom, refetch, isLoading } = useGetChannelsForRoom(Number(roomId));

  console.log('channelsForRoom', channelsForRoom)

  const sorted = useMemo(() => [...channelsForRoom].sort((a, b) => {
    const order = [
      ChannelType.CLIMATECONTROL_FLOOR_TRANSCEIVER,
      ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER,
      ChannelType.SWITCH_VIRTUAL_RECEIVER,
      ChannelType.BLIND_VIRTUAL_RECEIVER,
    ];
  
    const indexA = order.indexOf(a.type);
    const indexB = order.indexOf(b.type);
  
    if (indexA === -1 || indexB === -1) {
      return 0;
    }
  
    return indexA - indexB;
  }), [channelsForRoom]);

  const getControlComponent = (channel: Channel, refetch: () => void) => {
    switch (channel.type) {
      case ChannelType.CLIMATECONTROL_FLOOR_TRANSCEIVER:
        return <FloorControl channel={channel} />;
      case ChannelType.SWITCH_VIRTUAL_RECEIVER:
        return <LightControl refetch={refetch} channel={channel} />;
      case ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER:
        return <ThermostatControl channel={channel} />;
      case ChannelType.BLIND_VIRTUAL_RECEIVER:
        return <BlindsControl channel={channel} />;
      default:
        return <Box><Typography>{(channel as Channel).type} no implemented</Typography></Box>;
    }
  }

  if(isLoading) {
    return <LinearProgress />
  }

    return (
      <Container maxWidth="md">
        <List>
          {sorted.map((channel, index) => {
            
            return (
              <Box key={index}>
                <ListItem
                  disablePadding
                  key={channel.id}
                  sx={{
                    minHeight: '48px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                  }}
                >
                  <Box sx={{ my: '5px', width: '100%'}}>
                  {getControlComponent(channel, refetch)}
                  </Box>
                  
                </ListItem>
                {channelsForRoom?.length === index + 1 ? null : (
                  <Divider />
                )}
              </Box>
            );
          })}
        </List>
      </Container>
    );
};
