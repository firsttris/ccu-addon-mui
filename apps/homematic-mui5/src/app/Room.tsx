import {
  Box,
  Container,
  Divider,
  List,
  ListItem,
} from '@mui/material';
import { useParams } from 'react-router-dom';
import { ChannelType, useGetChannelsForRoom } from '../hooks/useApi';
import { BlindsControl } from './BlindsControl';
import { LightControl } from './LightControl';
import { ThermostatControl } from './ThermostatControl';

export const Room = () => {
  const { roomId } = useParams<{ roomId: string }>();

  const result = useGetChannelsForRoom(Number(roomId));
  const channelsForRoom = result.data?.channels ?? [];

    return (
      <Container maxWidth="md">
        <List>
          {channelsForRoom.map((channel, index) => {
            
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
                  {channel.type ===
                  ChannelType.SWITCH_VIRTUAL_RECEIVER ? (
                    <LightControl
                    refetch={result.refetch}
                    channel={channel}
                    />
                  ) : null}
                  {channel.type ===
                  ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER ? (
                    <ThermostatControl
                      channel={channel}
                    />
                  ) : null}
                  {channel.type ===
                  ChannelType.BLIND_VIRTUAL_RECEIVER ? (
                    <BlindsControl
                      channel={channel}
                    />
                  ) : null}
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
