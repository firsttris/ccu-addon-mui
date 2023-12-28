import { styled } from '@mui/system';
import { Box, CardHeader, IconButton } from '@mui/material';
import {
  SwitchVirtualReceiverChannel,
  useSetValueMutation,
} from '../hooks/useApi';
import { TypographyWithEllipsis } from './components/TypographyWithEllipsis';
import { Icon } from '@iconify/react';

interface ControlProps {
  channel: SwitchVirtualReceiverChannel;
  refetch: () => void;
}

const StyledBox = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
});

const TitleBox = styled(Box)({
  display: 'flex',
  alignItems: 'center',
});

const StyledIcon = styled(Icon)`
  font-size: 40px;
  background-color: lightGrey;
  border-radius: 10px;
  padding: 1px;
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
    <StyledBox>
      <CardHeader
        sx={{ cursor: 'pointer' }}
        onClick={onHandleChange}
        title={
          <TitleBox>
            <StyledIcon
              icon={checked ? 'mdi:light-switch' : 'mdi:light-switch-off'}
              color={checked ? 'orange' : 'unset'}
            />
            <TypographyWithEllipsis>{name}</TypographyWithEllipsis>
          </TitleBox>
        }
      />
    </StyledBox>
  );
};
