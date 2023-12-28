import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Box,
  Card,
  Collapse,
  Divider,
  IconButton,
  IconButtonProps,
  ListItem,
  ListItemButton,
  Typography,
  styled,
} from '@mui/material';
import { useState } from 'react';
import { Channel, ChannelType } from './../hooks/useApi';
import { FloorControl } from './FloorControl';
import { SwitchControl } from './SwitchControl';
import { ThermostatControl } from './ThermostatControl';
import { BlindsControl } from './BlindsControl';
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

const StyledCard = styled(Card)(({ theme }) => ({
  maxWidth: 320,
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
  >(false);
  const [expanded, setExpanded] = useState<boolean>(false);

  const handleExpandClick = () => setExpanded(!expanded);

  return (
    <Box key={index}>
      <ListItem disablePadding={true}>
        <ListItemButton
          sx={{ '&:hover': { backgroundColor: 'transparent' } }}
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
          <ExpandMore
            expand={expanded}
            aria-expanded={expanded}
            aria-label="show more"
          >
            <ExpandMoreIcon />
          </ExpandMore>
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
