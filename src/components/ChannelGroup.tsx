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

const Card = styled.div`
  background: ${props => props.theme.colors.surface};
  box-shadow: 0px 1px 3px rgba(0, 0, 0, 0.2);
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 4px;
  overflow: hidden;
`;

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

export const ListItem = styled.div`
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  cursor: pointer;
  background: ${props => props.theme.colors.background};
  &:hover {
    background: ${props => props.theme.colors.hover};
  }
`;

export const Typography = styled.p`
  color: ${props => props.theme.colors.text};
  max-width: 300px;
  overflow: hidden;
  white-space: wrap;
  text-overflow: ellipsis;
  font-weight: 600;
  margin: 10px 0;
  font-size: 20px;
  @media (max-width: 800px) {
    margin-left: 70px;
  }
`;

const Divider = styled.hr`
  width: 100%;
  border: none;
  border-top: 1px solid ${props => props.theme.colors.border};
  margin-top: 16px;
  margin-bottom: 0px;
`;

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

  const localizedText = t(channelType as any);

  if (!localizedText) {
    console.error('No localization found for channel type:', channelType);
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
