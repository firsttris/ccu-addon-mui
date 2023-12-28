import { styled } from '@mui/system';
import { Box, CardHeader } from '@mui/material';
import {
  SwitchVirtualReceiverChannel,
  useSetValueMutation,
} from '../hooks/useApi';
import { IconButtonWithHover } from './components/IconButtonWithHover';
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
        width="100%"
        title={
          <TitleBox>
            <IconButtonWithHover onClick={onHandleChange}>
              {checked ? (
                <Icon
                  icon="mdi:light-switch"
                  fontSize="40px"
                  color="orange"
                />
              ) : (
                <Icon icon="mdi:light-switch-off" fontSize="40px" />
              )}
            </IconButtonWithHover>
            <TypographyWithEllipsis>{name}</TypographyWithEllipsis>
          </TitleBox>
        }
      />
    </StyledBox>
  );
};
