import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Collapse,
  Container,
  IconButton,
  IconButtonProps,
  LinearProgress,
  Typography,
} from '@mui/material';
import { useParams } from 'react-router-dom';
import { Channel, ChannelType, useGetChannelsForRoom } from '../hooks/useApi';
import { BlindsControl } from './BlindsControl';
import { LightControl } from './LightControl';
import { ThermostatControl } from './ThermostatControl';
import { FloorControl } from './FloorControl';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useMemo, useState } from 'react';
import styled from '@emotion/styled';

interface ExpandMoreProps extends IconButtonProps {
  expand: boolean;
}

const ExpandMore = styled((props: ExpandMoreProps) => {
  const { expand, ...other } = props;
  return <IconButton {...other} />;
})(({ expand }) => ({
  transform: !expand ? 'rotate(0deg)' : 'rotate(180deg)',
  marginLeft: 'auto',
  transition: 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms',
}));

export const Room = () => {
  const [expanded, setExpanded] = useState<Record<ChannelType, boolean>>(
    Object.fromEntries(
      Object.values(ChannelType).map((type) => [type, true])
    ) as Record<ChannelType, boolean>
  );

  const handleExpandClick = (channelType: ChannelType) => {
    setExpanded((prevExpanded) => ({
      ...prevExpanded,
      [channelType]: !prevExpanded[channelType],
    }));
  };

  const { roomId } = useParams<{ roomId: string }>();

  const {
    data: channelsForRoom,
    refetch,
    isLoading,
  } = useGetChannelsForRoom(Number(roomId));

  console.log('channelsForRoom', channelsForRoom);

  const channelsPerType = useMemo(() => {
    return channelsForRoom?.reduce((acc, channel) => {
      const channels = acc.get(channel.type);

      if (channels) {
        channels.push(channel);
      } else {
        acc.set(channel.type, [channel]);
      }

      return acc;
    }, new Map<ChannelType, Channel[]>());
  }, [channelsForRoom]);

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
        return (
          <Box>
            <Typography>{(channel as Channel).type} no implemented</Typography>
          </Box>
        );
    }
  };

  if (isLoading) {
    return <LinearProgress />;
  }

  return (
    <Container maxWidth="xl" sx={{ display: 'flex', flexDirection: 'column', gap: '10px'}}>
      {Array.from(channelsPerType).map(([channelType, channels]) => {
        return channels.length ? (
          <Card key={channelType}>
            <CardHeader
              title={
                <Box sx={{ display: 'flex'}}>
                  <Typography>
                    {channelType}
                  </Typography>
                  <ExpandMore
                    expand={expanded[channelType]}
                    onClick={() => handleExpandClick(channelType)}
                    aria-expanded={expanded[channelType]}
                    aria-label="show more"
                  >
                    <ExpandMoreIcon />
                  </ExpandMore>
                </Box>
              }
            />
            <Collapse in={expanded[channelType]} timeout="auto" unmountOnExit>
              <CardContent
                sx={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}
              >
                {channels.map((channel, index) => {
                  return (
                    <Card key={index} sx={{ maxWidth: 345 }}>
                      {getControlComponent(channel, refetch)}
                    </Card>
                  );
                })}
              </CardContent>
            </Collapse>
          </Card>
        ) : null;
      })}
    </Container>
  );
};
