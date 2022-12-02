import {
  Box,
  CircularProgress,
  Container,
  Divider,
  List,
  ListItem,
} from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { ChannelType, useChannelForRoom } from '../hooks/useApi';
import { BlindsControl } from './BlindsControl';
import { LightControl } from './LightControl';
import { ThermostatControl } from './ThermostatControl';

export const Room = () => {
  const [searchParams] = useSearchParams();

  const channelIds = searchParams.get('channelIds')?.split(',');

  const result = useChannelForRoom(channelIds);

  const channelsForRoom = result.channelsForRoom ?? [];
  const allDevices = result.data?.data.result ?? [];

  if (result.isFetched) {
    return (
      <Container maxWidth="md">
        <List>
          {channelsForRoom.map((channel, index) => {
            const splitted = channel.address.split(':');
            const interfaceName =
              allDevices.find((device) => device.address === splitted[0])
                ?.interface ?? '';
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
                  {channel.channelType ===
                  ChannelType.SWITCH_VIRTUAL_RECEIVER ? (
                    <LightControl
                      address={channel.address}
                      name={channel.name}
                      interfaceName={interfaceName}
                    />
                  ) : null}
                  {channel.channelType ===
                  ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER ? (
                    <ThermostatControl
                      interfaceName={interfaceName}
                      address={channel.address}
                      name={channel.name}
                    />
                  ) : null}
                  {channel.channelType ===
                  ChannelType.BLIND_VIRTUAL_RECEIVER ? (
                    <BlindsControl
                      interfaceName={interfaceName}
                      address={channel.address}
                      name={channel.name}
                    />
                  ) : null}
                </ListItem>
                {result.channelsForRoom?.length === index + 1 ? null : (
                  <Divider />
                )}
              </Box>
            );
          })}
        </List>
      </Container>
    );
  } else if (result.isLoading) {
    return (
      <Box
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <CircularProgress />
      </Box>
    );
  } else {
    return null;
  }
};
