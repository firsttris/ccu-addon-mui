import { KeymaticChannel } from '../types/types';
import { useTranslations } from '../i18n/utils';
import styled from '@emotion/styled';
import { Button } from '../components/Button';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { MaterialSymbolsDoorOpenOutline } from '../components/icons/MaterialSymbolsDoorOpenOutline';
import { MaterialSymbolsLockOutline } from '../components/icons/MaterialSymbolsLockOutline';
import { MaterialSymbolsLockOpenOutline } from '../components/icons/MaterialSymbolsLockOpenOutline';

const OuterBox = styled.div({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '10px'
});

const InnerBox = styled.div({
  display: 'flex',
  gap: '10px',
  alignItems: 'center',
});

interface StyledTypographyProps {
  uncertain: boolean;
}

const StyledTypography = styled('span', {
  shouldForwardProp: (prop) => prop !== 'uncertain',
})<StyledTypographyProps>(({ uncertain }) => ({
  display: uncertain ? 'block' : 'none',
  marginTop: '10px'
}));

interface DoorControlProps {
  channel: KeymaticChannel;
}

export const DoorControl: React.FC<DoorControlProps> = ({ channel }) => {
  const t = useTranslations();
  const { setDataPoint } = useWebSocketContext();
  const {
    datapoints: { STATE, STATE_UNCERTAIN },
  } = channel;

  const isUncertain = STATE_UNCERTAIN === true;
  const isUnlocked = STATE === true;

  const unlockDoor = async () => {
    setDataPoint(channel.interfaceName, channel.address, 'STATE', true);
  };

  const lockDoor = async () => {
    setDataPoint(channel.interfaceName, channel.address, 'STATE', false);
  };

  const openDoor = async () => {
    setDataPoint(channel.interfaceName, channel.address, 'OPEN', true);
  };

  return (
    <OuterBox>
      <InnerBox>
        <Button onClick={lockDoor}>
          <MaterialSymbolsLockOutline />
        </Button>
        <Button onClick={unlockDoor}>
          <MaterialSymbolsLockOpenOutline />
        </Button>
        <Button onClick={openDoor}>
          <MaterialSymbolsDoorOpenOutline />
        </Button>
      </InnerBox>
      <StyledTypography uncertain={isUncertain}>
        {t('DOOR_STATE_UNKNOWN')}
      </StyledTypography>
    </OuterBox>
  );
};
