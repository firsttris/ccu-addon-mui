import { TranslationKey, useTranslations } from '../i18n/utils';
import { Channel, ChannelStatus } from '../types/types';
import { controlOverrides } from '../controls/registry';
import { useLocalStorage } from '../hooks/useLocalStorage';
import styled from '@emotion/styled';
import { ControlComponent } from './ControlComponent';
import UiwDown from '~icons/uiw/down';
import { m } from '../paraglide/messages';

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
  display: flex;
  flex-direction: column;
`;

const CardBody = styled('div', {
  shouldForwardProp: (prop) => prop !== 'unreachable',
})<{ unreachable: boolean }>`
  flex: 1;
  display: flex;
  justify-content: center;
  /* The values of an unreachable device are stale (often all 0) */
  ${({ unreachable }) => (unreachable ? 'opacity: 0.45; filter: grayscale(1);' : '')}
`;

const StatusBar = styled('div', {
  shouldForwardProp: (prop) => prop !== 'severity',
})<{ severity: 'warning' | 'error' }>`
  /* Fills the card's width without making narrow cards wider */
  width: 0;
  min-width: 100%;
  box-sizing: border-box;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  color: ${(props) => props.theme.colors.text};
  background: ${({ severity }) =>
    severity === 'error' ? 'rgba(244, 67, 54, 0.2)' : 'rgba(255, 193, 7, 0.25)'};
`;

const ChannelStatusBar = ({ status }: { status?: ChannelStatus }) => {
  const t = useTranslations();
  return (
    <>
      {status?.UNREACH && (
        <StatusBar role="status" severity="error">
          📡 {m.UNREACH()}
        </StatusBar>
      )}
      {status?.LOW_BAT && (
        <StatusBar role="status" severity="warning">
          🪫 {m.LOW_BAT()}
        </StatusBar>
      )}
    </>
  );
};

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
  white-space: nowrap;
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

// Groups channels by device (the address before ":"), in order of appearance
const groupByDevice = <T extends Channel>(channels: T[]) => {
  const devices = new Map<string, T[]>();
  for (const channel of channels) {
    const deviceAddress = channel.address.split(':')[0];
    devices.set(deviceAddress, [...(devices.get(deviceAddress) ?? []), channel]);
  }
  return Array.from(devices);
};

interface ChannelGroupProps {
  channelType: string;
  channels: Channel[];
}

export const ChannelGroup: React.FC<ChannelGroupProps> = ({
  channelType,
  channels,
}) => {
  const t = useTranslations();
  const override = controlOverrides[channelType];

  const [expanded, setExpanded] = useLocalStorage(channelType, false);

  const handleExpandClick = () => {
    setExpanded(!expanded);
  };

  // Types without a translation (shown by GenericControl) keep the CCU's name
  const localizedText = t(channelType as TranslationKey);

  return (
    <div>
      <ListItem onClick={handleExpandClick}>
        <Typography>{localizedText}</Typography>
        <ExpandMore expanded={expanded} width={30} />
      </ListItem>
      <Collapse in={expanded}>
        <ChannelContainer>
          {override?.per === 'device'
            ? // One card per device instead of one per channel
              groupByDevice(channels).map(([deviceAddress, deviceChannels]) => (
                <Card key={deviceAddress}>
                  <CardBody unreachable={deviceChannels[0].status?.UNREACH === true}>
                    <override.component channels={deviceChannels} />
                  </CardBody>
                  <ChannelStatusBar status={deviceChannels[0].status} />
                </Card>
              ))
            : channels.map((channel) => (
                <Card key={channel.address}>
                  <CardBody unreachable={channel.status?.UNREACH === true}>
                    <ControlComponent channel={channel} />
                  </CardBody>
                  <ChannelStatusBar status={channel.status} />
                </Card>
              ))}
        </ChannelContainer>
        <Divider />
      </Collapse>
    </div>
  );
};
