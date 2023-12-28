import {
  Box,
  Card,
  Collapse,
  Container,
  Divider,
  IconButton,
  IconButtonProps,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  Typography,
  styled,
} from '@mui/material';
import { useParams } from 'react-router-dom';
import { Channel, ChannelType, useGetChannelsForRoom } from '../hooks/useApi';
import { BlindsControl } from './BlindsControl';
import { LightControl } from './LightControl';
import { ThermostatControl } from './ThermostatControl';
import { FloorControl } from './FloorControl';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useMemo, useState } from 'react';
import { useTranslations } from './../i18n/utils';

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
  padding: '1px',
  backgroundColor: 'lightgrey',
  borderRadius: '50%',
  '&:hover': {
    backgroundColor: 'darkgrey',
  },
}));

const StyledContainer = styled(Container)({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
});

const StyledCard = styled(Card)(({ theme }) => ({
  maxWidth: 320,
  [theme.breakpoints.down('md')]: {
    width: '100%',
  },
}));

export const Room = () => {
  const [hasTransitionExited, setHasTransitionExited] = useState<
    Record<string, boolean>
  >({});
  const [expanded, setExpanded] = useState<Record<ChannelType, boolean>>(
    Object.fromEntries(
      Object.values(ChannelType).map((type) => [type, true])
    ) as Record<ChannelType, boolean>
  );

  const t = useTranslations();

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
    <StyledContainer maxWidth="xl">
      <List disablePadding={true}>
        {Array.from(channelsPerType).map(([channelType, channels], index) => {
          return channels.length ? (
            <Box key={index}> 
              <ListItem disablePadding={true}>
                <ListItemButton
                  onClick={() => handleExpandClick(channelType)}
                  disableRipple={true}
                >
                  <Typography
                    sx={{
                      maxWidth: '300px',
                      overflow: 'hidden',
                      whiteSpace: 'wrap',
                      textOverflow: 'ellipsis',
                      fontWeight: 600,
                      my: '10px',
                    }}
                  >
                    {t(channelType)}
                  </Typography>
                  <ExpandMore
                    expand={expanded[channelType]}
                    aria-expanded={expanded[channelType]}
                    aria-label="show more"
                  >
                    <ExpandMoreIcon />
                  </ExpandMore>
                </ListItemButton>
              </ListItem>
              {hasTransitionExited[channelType] ? <Divider /> : null}
              <Collapse
                in={expanded[channelType]}
                timeout="auto"
                onEnter={() =>
                  setHasTransitionExited((prevState) => ({
                    ...prevState,
                    [channelType]: false,
                  }))
                }
                onExited={() =>
                  setHasTransitionExited((prevState) => ({
                    ...prevState,
                    [channelType]: true,
                  }))
                }
              >
                <Divider
                  sx={{
                    mb: '10px',
                  }}
                />
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {channels.map((channel, index) => {
                    return (
                      <StyledCard key={index}>
                        {getControlComponent(channel, refetch)}
                      </StyledCard>
                    );
                  })}
                </Box>
                <Divider sx={{ mt: '10px' }} />
              </Collapse>
            </Box>
          ) : null;
        })}
      </List>
    </StyledContainer>
  );
};
