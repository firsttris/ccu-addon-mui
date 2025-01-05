import { useSetValueMutation } from '../../hooks/useApi';
import { ChannelHeader } from '../components/ChannelHeader';
import { SwitchVirtualReceiverChannel } from 'src/types/types';
import styled from '@emotion/styled';

interface ControlProps {
  channel: SwitchVirtualReceiverChannel;
  refetch: () => void;
}

const StyledBox = styled.div({
  background: '#f5f5f5',
  display: 'flex',
  flexDirection: 'column',
});

const ChannelHeaderWithPointer = styled(ChannelHeader)({
  cursor: 'pointer',
});

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
    <StyledBox>
      <ChannelHeaderWithPointer
        name={name}
        icon={checked ? 'mdi:light-switch' : 'mdi:light-switch-off'}
        color={checked ? 'orange' : 'unset'}
        onClick={onHandleChange}
      />
    </StyledBox>
  );
};
