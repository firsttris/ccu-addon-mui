import { useTranslations } from '../i18n/utils';
import { Channel, ChannelType } from '../types/types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import styled from '@emotion/styled';
import { ControlComponent } from './ControlComponent';
import { UiwDown } from './icons/UiwDown';

interface ExpandMoreProps {
  expanded: boolean;
}

const ExpandMore = styled(UiwDown, {
  shouldForwardProp: (prop) => prop !== 'expanded',
})<ExpandMoreProps>(({ expanded }) => ({
  transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
  marginLeft: 'auto',
  transition: 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms',
  fontSize: '25px',
}));

const Card = styled.div({
  background: '#f5f5f5',
  boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.2)',
  border: '1px solid #ccc',
  borderRadius: '4px',
  overflow: 'hidden',
});

const ChannelContainer = styled.div({
  marginTop: '15px',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '10px',
  '@media (max-width: 800px)': {
    marginLeft: '90px',
    marginRight: '90px',
  },
  '@media (max-width: 600px)': {
    justifyContent: 'center',
    marginLeft: '0px',
    marginRight: '0px',
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
  '@media (max-width: 800px)': {
    marginLeft: '70px',
  },
});

const Divider = styled.hr({
  width: '100%',
  border: 'none',
  borderTop: '1px solid #e0e0e0',
  marginTop: '16px',
  marginBottom: '0px',
});

const Collapse = styled('div', {
  shouldForwardProp: (prop) => prop !== 'in',
})<{ in: boolean }>(({ in: inProp }) => ({
  display: inProp ? 'block' : 'none',
}));

interface ChannelGroupProps {
  index: number;
  channelType: ChannelType;
  channels: Channel[];
}

export const ChannelGroup: React.FC<ChannelGroupProps> = ({
  index,
  channelType,
  channels,
}) => {
  const t = useTranslations();

  const [expanded, setExpanded] = useLocalStorage(channelType, false);

  const handleExpandClick = () => {
    setExpanded(!expanded);
  };

  const localizedText = t(channelType);

  if (!localizedText) {
    return null;
  }

  return (
    <div key={index}>
      <ListItem onClick={handleExpandClick}>
        <Typography>{localizedText}</Typography>
        <ExpandMore expanded={expanded} width={30} />
      </ListItem>
      <Collapse in={expanded}>
        <ChannelContainer>
          {channels.map((channel, index) => (
            <Card key={index}>
              <ControlComponent channel={channel} />
            </Card>
          ))}
        </ChannelContainer>
        <Divider />
      </Collapse>
    </div>
  );
};
