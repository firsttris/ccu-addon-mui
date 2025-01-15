import { SwitchVirtualReceiverChannel } from 'src/types/types';
import styled from '@emotion/styled';
import { Icon } from '@iconify/react';
import { useWebSocketContext } from '../hooks/useWebsocket';

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

export const SwitchControl = ({ channel }: ControlProps) => {
  const { setDataPoint } = useWebSocketContext();
  const { datapoints, name, address, interfaceName } = channel;
  const checked = datapoints.STATE === true;

  const onHandleChange = async () => {
    setDataPoint(interfaceName, address, 'STATE', checked ? false : true);
  };

  return (
    <CardHeader onClick={onHandleChange}>
      <div style={{ height: "65px"}}>{name}</div>
      <Icon
        icon={checked ? 'mdi:light-switch' : 'mdi:light-switch-off'}
        color={checked ? 'orange' : 'unset'}
        fontSize={"72px"}
      />
    </CardHeader>
  );
};
