import {
  Box,
  Card,
  Collapse,
  Divider,
  ListItem,
  ListItemButton,
  Typography,
  styled,
} from '@mui/material';
import { useState } from 'react';
import { FloorControl } from './controls/FloorControl';
import { SwitchControl } from './controls/SwitchControl';
import { ThermostatControl } from './controls/ThermostatControl';
import { BlindsControl } from './controls/BlindsControl';
import { useTranslations } from './../i18n/utils';
import { Icon } from '@iconify/react';
import { Channel, ChannelType } from './../types/types';
import { RainDetectionControl } from './controls/RainDetectionControl';
import { DoorControl } from './controls/DoorControl';


interface ExpandMoreProps {
  expanded: string;
}

const ExpandMore = styled(Icon)<ExpandMoreProps>(({ expanded }) => ({
  transform: expanded === 'true' ? 'rotate(180deg)' : 'rotate(0deg)',
  marginLeft: 'auto',
  transition: 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms',
  fontSize: '25px',
}));

const StyledCard = styled(Card)(({ theme }) => ({
  maxWidth: 288,
  [theme.breakpoints.down('md')]: {
    width: '100%',
  },
}));

const getControlComponent = (channel: Channel, refetch: () => void) => {
  switch (channel.type) {
    case ChannelType.CLIMATECONTROL_FLOOR_TRANSCEIVER:
      return <FloorControl channel={channel} />;
    case ChannelType.SWITCH_VIRTUAL_RECEIVER:
      return <SwitchControl refetch={refetch} channel={channel} />;
    case ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER:
      return <ThermostatControl channel={channel} />;
    case ChannelType.BLIND_VIRTUAL_RECEIVER:
      return <BlindsControl channel={channel} />;
    case ChannelType.RAIN_DETECTION_TRANSMITTER:
      return <RainDetectionControl channel={channel} />;  
    case ChannelType.KEYMATIC:
      return <DoorControl refetch={refetch} channel={channel} />;
    default:
      return (
        <Box>
          <Typography>{(channel as Channel).type} no implemented</Typography>
        </Box>
      );
  }
};

interface ChannelTypeProps {
  index: number;
  channelType: ChannelType;
  channels: Channel[];
  refetch: () => void;
}

export const ChannelsForType: React.FC<ChannelTypeProps> = ({
  index,
  channelType,
  channels,
  refetch,
}) => {
  const t = useTranslations();

  const [hasTransitionExited, setHasTransitionExited] = useState<
  boolean
  >(true);
  const [expanded, setExpanded] = useState<boolean>(false);

  const handleExpandClick = () => setExpanded(!expanded);

  return (
    <Box key={index}>
      <ListItem disablePadding={true}>
        <ListItemButton
          sx={{ '&:hover': { backgroundColor: 'transparent' }, px: 0 }}
          onClick={() => handleExpandClick()}
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
          <ExpandMore icon="uiw:down" expanded={expanded.toString()}/>
        </ListItemButton>
      </ListItem>
      {hasTransitionExited ? <Divider /> : null}
      <Collapse
        in={expanded}
        timeout="auto"
        onEnter={() =>
          setHasTransitionExited(false)
        }
        onExited={() =>
          setHasTransitionExited(true)
        }
      >
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
  );
};
