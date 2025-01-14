import { FloorControl } from './controls/FloorControl';
import { SwitchControl } from './controls/SwitchControl';
import { BlindsControl } from './controls/BlindsControl';
import { useTranslations } from './../i18n/utils';
import { Icon } from '@iconify/react';
import { Channel, ChannelType } from './../types/types';
import { DoorControl } from './controls/DoorControl';
import { useLocalStorage } from './../hooks/useLocalStorage';
import styled from '@emotion/styled';
import ThermostatCard from './controls/ThermostatCard';
import {Blinds} from './controls/Blinds';

interface ExpandMoreProps {
  expanded: boolean;
}

const ExpandMore = styled(Icon, {
  shouldForwardProp: (prop) => prop !== 'expanded',
})<ExpandMoreProps>(({ expanded }) => ({
  transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
  marginLeft: 'auto',
  transition: 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms',
  fontSize: '25px',
}));

const StyledCard = styled.div({
  backgroundColor: '#fff',
  boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.2)',
  borderRadius: '4px',
  overflow: 'hidden',
});

const StyledBox = styled.div({
  marginTop: '15px',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '10px',
  justifyContent: 'space-evenly',
  '@media (max-width: 600px)': {
    justifyContent: 'center',
  },
});

export const ListItem = styled.div({
  display: 'flex',
  alignItems: 'center',
  padding: '8px 16px',
  borderBottom: '1px solid #e0e0e0',
  cursor: 'pointer',
});

export const Typography = styled.p({
  color: '#000',
  maxWidth: '300px',
  overflow: 'hidden',
  whiteSpace: 'wrap',
  textOverflow: 'ellipsis',
  fontWeight: 600,
  margin: '10px 0',
  fontSize: '20px',
});

const Divider = styled.hr({
  width: '100%',
  border: 'none',
  borderTop: '1px solid #e0e0e0',
  marginTop: '16px',
  marginBottom: '0px'
});

const Collapse = styled('div', {
  shouldForwardProp: (prop) => prop !== 'in',
})<{ in: boolean }>(({ in: inProp }) => ({
  display: inProp ? 'block' : 'none',
}));

const getControlComponent = (channel: Channel) => {
  switch (channel.type) {
    case ChannelType.CLIMATECONTROL_FLOOR_TRANSCEIVER:
      return <FloorControl channel={channel} />;
    case ChannelType.SWITCH_VIRTUAL_RECEIVER:
      return <SwitchControl channel={channel} />;
    case ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER:
      return <ThermostatCard />;
    case ChannelType.BLIND_VIRTUAL_RECEIVER:
      return <Blinds />;
    case ChannelType.KEYMATIC:
      return <DoorControl channel={channel} />;
    default:
      return (
        <div>
          <Typography>{(channel as Channel).type} not implemented</Typography>
        </div>
      );
  }
};

interface ChannelTypeProps {
  index: number;
  channelType: ChannelType;
  channels: Channel[];
}

export const ChannelsForType: React.FC<ChannelTypeProps> = ({
  index,
  channelType,
  channels,
}) => {
  const t = useTranslations();

  const [expanded, setExpanded] = useLocalStorage(channelType, false);

  const handleExpandClick = () => {
    setExpanded(!expanded);
  };

  return (
    <div key={index}>
      <ListItem onClick={handleExpandClick}>
          <Typography>{t(channelType)}</Typography>
          <ExpandMore icon="uiw:down" expanded={expanded} />
      </ListItem>
      <Collapse
        in={expanded}
      >
        <StyledBox>
          {channels.map((channel, index) => (
            <StyledCard key={index}>
              {getControlComponent(channel)}
            </StyledCard>
          ))}
        </StyledBox>
        <Divider />
      </Collapse>
    </div>
  );
};