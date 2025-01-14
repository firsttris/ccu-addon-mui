import { IconButton } from '../components/StyledIcons';
import { KeymaticChannel } from './../../types/types';
import { useTranslations } from './../../i18n/utils';
import styled from '@emotion/styled';

const OuterBox = styled.div({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
});

const InnerBox = styled.div({
  display: 'flex',
  gap: '10px',
  alignItems: 'center',
});

interface StyledTypographyProps {
  uncertain: boolean
}

const StyledTypography = styled('span', {
  shouldForwardProp: (prop) => prop !== 'uncertain',
})<StyledTypographyProps>(({ uncertain }) => ({
  display: uncertain ? 'block' : 'none',
}));

interface DoorControlProps {
  channel: KeymaticChannel;
}

export const DoorControl: React.FC<DoorControlProps> = ({ channel }) => {
  const t = useTranslations();
  const {
    datapoints: { STATE, STATE_UNCERTAIN },
  } = channel;

  const isUncertain = STATE_UNCERTAIN === 'true';
  const isUnlocked = STATE === 'true';

  const unlockDoor = async () => {
    /*
    await setValueMutation.mutateAsync({
      interface: channel.interfaceName,
      address: channel.address,
      valueKey: 'STATE',
      type: 'boolean',
      value: true,
    });
    */
  };

  const lockDoor = async () => {
    /*
    await setValueMutation.mutateAsync({
      interface: channel.interfaceName,
      address: channel.address,
      valueKey: 'STATE',
      type: 'boolean',
      value: false,
    });
    */
  };

  const openDoor = async () => {
    /*
    await setValueMutation.mutateAsync({
      interface: channel.interfaceName,
      address: channel.address,
      valueKey: 'OPEN',
      type: 'boolean',
      value: true,
    });
    */
  };

  return (
    <div>
      <OuterBox>
        <InnerBox>
          <IconButton
            icon="material-symbols:lock-outline"
            active={!isUnlocked}
            onClick={lockDoor}
          />
          <IconButton
            icon="material-symbols:lock-open-outline"
            active={isUnlocked}
            onClick={unlockDoor}
          />
          <IconButton
            icon="material-symbols:door-open-outline"
            onClick={openDoor}
          />
        </InnerBox>
        <StyledTypography
          uncertain={isUncertain}
        >
          {t('DOOR_STATE_UNKNOWN')}
        </StyledTypography>
      </OuterBox>
    </div>
  );
};
