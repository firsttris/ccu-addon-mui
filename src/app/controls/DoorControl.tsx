import { Box, CardHeader, Typography } from '@mui/material';
import { StyledIconButton } from '../components/StyledIcons';
import { KeymaticChannel } from './../../types/types';
import { useSetValueMutation } from './../../hooks/useApi';
import { styled } from '@mui/system';
import { styledWithForward } from './../../styled';

const StyledOuterBox = styled(Box)({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  });
  
  const StyledInnerBox = styled(Box)({
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
  });
  
  interface StyledTypographyProps {
    isUncertain: boolean;
  }
  const StyledTypography = styledWithForward(Typography)<StyledTypographyProps>(({ isUncertain }) => ({
    display: isUncertain ? 'block' : 'none',
  }));

interface DoorControlProps {
  channel: KeymaticChannel;
  refetch: () => void;
}

export const DoorControl: React.FC<DoorControlProps> = ({ channel, refetch }) => {
  const setValueMutation = useSetValueMutation();
  const {
    datapoints: { STATE, STATE_UNCERTAIN },
  } = channel;

  const isUncertain = STATE_UNCERTAIN === 'true';
  const isUnlocked = STATE === 'true';

  const unlockDoor = async () => {
    await setValueMutation.mutateAsync({
      interface: channel.interfaceName,
      address: channel.address,
      valueKey: 'STATE',
      type: 'boolean',
      value: true,
    });
    refetch()
  };

  const lockDoor = async () => {
    await setValueMutation.mutateAsync({
      interface: channel.interfaceName,
      address: channel.address,
      valueKey: 'STATE',
      type: 'boolean',
      value: false,
    });
    refetch()
  };

  const openDoor = async () => {
    await setValueMutation.mutateAsync({
      interface: channel.interfaceName,
      address: channel.address,
      valueKey: 'OPEN',
      type: 'boolean',
      value: true,
    });
    refetch()
  };

  return (
    <CardHeader
      title={
        <StyledOuterBox>
          <StyledInnerBox>
            <StyledIconButton
              icon="material-symbols:lock-outline"
              active={(!isUnlocked).toString()}
              onClick={lockDoor}
            />
            <StyledIconButton
              icon="material-symbols:lock-open-outline"
              active={isUnlocked.toString()}
              onClick={unlockDoor}
            />
            <StyledIconButton
              icon="material-symbols:door-open-outline"
              onClick={openDoor}
            />
          </StyledInnerBox>
          <StyledTypography
            isUncertain={isUncertain}
            variant="caption"
          >
            Door state is uncertain
          </StyledTypography>
        </StyledOuterBox>
      }
    />
  );
};
