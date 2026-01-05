import { SwitchVirtualReceiverChannel } from 'src/types/types';
import styled from '@emotion/styled';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { EmojioneLightBulb } from '../components/icons/EmojioneLightBlub';
import { EmojioneMonotoneLightBulb } from '../components/icons/EmojioneMonotoneLightBulb';

interface ControlProps {
  channel: SwitchVirtualReceiverChannel;
}

const CardHeader = styled.div<{ onClick?: () => void }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  padding: 10px;
  width: 100px;
`;

const Name = styled.div`
  white-space: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
  height: 35px;
  font-size: 13px;
`;

const IconContainer = styled.div<{ checked: boolean }>`
  margin-top: 10px;
  filter: ${({ checked }) => checked ? 'drop-shadow(0 0 8px rgba(255, 255, 0, 0.6))' : 'none'};
`;

export const SwitchControl = ({ channel }: ControlProps) => {
  const { setDataPoint } = useWebSocketContext();
  const { datapoints, name, address, interfaceName } = channel;
  const checked = datapoints.STATE === true;

  const onHandleChange = async () => {
    setDataPoint(interfaceName, address, 'STATE', checked ? false : true);
  };

  return (
    <CardHeader onClick={onHandleChange}>
      <Name>{name}</Name>
      <IconContainer checked={checked}>
        {checked ? <EmojioneLightBulb /> : <EmojioneMonotoneLightBulb />}
      </IconContainer>
    </CardHeader>
  );
};
