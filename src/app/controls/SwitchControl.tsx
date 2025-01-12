import { useSetValueMutation } from '../../hooks/useApi';
import { SwitchVirtualReceiverChannel } from 'src/types/types';
import styled from '@emotion/styled';
import { Icon } from '@iconify/react';

interface ControlProps {
  channel: SwitchVirtualReceiverChannel;
  refetch: () => void;
}

const CardHeader = styled.div<{ onClick?: () => void }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  padding: 20px;
  width: 100px;
`;

export const SwitchControl = ({ channel, refetch }: ControlProps) => {
  const setValueMutation = useSetValueMutation();
  const { datapoints, name, address, interfaceName } = channel;
  const checked = datapoints.STATE === 'true';

  const onHandleChange = async () => {
    await setValueMutation.mutateAsync({
      interface: interfaceName,
      address,
      valueKey: 'STATE',
      type: 'boolean',
      value: !checked,
    });
    refetch();
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
