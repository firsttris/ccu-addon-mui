import {
  Box,
  CircularProgress,
  Container,
  Divider,
  List,
  ListItem,
} from '@mui/material';
import { useParams, useSearchParams } from 'react-router-dom';
import { ChannelType, useGetChannelsForRoom } from '../hooks/useApi';
import { BlindsControl } from './BlindsControl';
import { LightControl } from './LightControl';
import { ThermostatControl } from './ThermostatControl';

export const Room = () => {
  const { roomId } = useParams<{ roomId: string }>();
  console.log('roomId', roomId)
  const result = useGetChannelsForRoom(Number(roomId));
  const channelsForRoom = result.data?.channels ?? [];

  console.log('channelsForRoom', channelsForRoom)
    return (
      <Container maxWidth="md">
        <List>
          {channelsForRoom.map((channel, index) => {
            const interfaceName = 'mocked'
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
                      address={channel.address}
                      name={channel.name}
                      interfaceName={interfaceName}
                      checked={channel.datapoints.STATE === 'true'}
                    />
                  ) : null}
                  {channel.type ===
                  ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER ? (
                    <ThermostatControl
                      interfaceName={interfaceName}
                      address={channel.address}
                      name={channel.name}
                      value={channel.datapoints}
                    />
                  ) : null}
                  {channel.type ===
                  ChannelType.BLIND_VIRTUAL_RECEIVER ? (
                    <BlindsControl
                      interfaceName={interfaceName}
                      address={channel.address}
                      name={channel.name}
                      blindValue={Number(channel.datapoints.LEVEL)}
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
