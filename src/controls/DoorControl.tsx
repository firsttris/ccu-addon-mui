import { KeymaticChannel } from '../types/types';
import { useTranslations } from '../i18n/utils';
import styled from '@emotion/styled';
import { Button } from '../components/Button';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { MaterialSymbolsDoorOpenOutline } from '../components/icons/MaterialSymbolsDoorOpenOutline';
import { MaterialSymbolsLockOutline } from '../components/icons/MaterialSymbolsLockOutline';
import { MaterialSymbolsLockOpenOutline } from '../components/icons/MaterialSymbolsLockOpenOutline';

const Card = styled.div({
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  padding: '16px',
  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  width: '200px',
  backgroundColor: '#ffffff',
  transition: 'box-shadow 0.2s ease',
  '&:hover': {
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
  },
});

const Title = styled.h3({
  margin: '0 0 12px 0',
  fontSize: '16px',
  fontWeight: '500',
  color: '#333333',
  textAlign: 'center',
});

const ButtonContainer = styled.div({
  display: 'flex',
  gap: '12px',
  alignItems: 'center',
});

const ButtonWrapper = styled.div({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '4px',
});

const ButtonLabel = styled.span({
  fontSize: '12px',
  color: '#666666',
  textAlign: 'center',
});

const StatusText = styled.span({
  marginTop: '12px',
  fontSize: '14px',
  color: '#666666',
  textAlign: 'center',
});

interface StyledTypographyProps {
  uncertain: boolean;
}

const StyledTypography = styled('span', {
  shouldForwardProp: (prop) => prop !== 'uncertain',
})<StyledTypographyProps>(({ uncertain }) => ({
  display: uncertain ? 'block' : 'none',
  marginTop: '12px',
  fontSize: '14px',
  color: '#ff9800',
  textAlign: 'center',
}));

interface DoorControlProps {
  channel: KeymaticChannel;
}

export const DoorControl: React.FC<DoorControlProps> = ({ channel }) => {
  const t = useTranslations();
  const { setDataPoint } = useWebSocketContext();
  const {
    datapoints: { STATE, STATE_UNCERTAIN },
    name,
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
    <Card>
      <Title>{name}</Title>
      <ButtonContainer>
        <ButtonWrapper>
          <Button onClick={lockDoor}>
            <MaterialSymbolsLockOutline />
          </Button>
          <ButtonLabel>{t('LOCK')}</ButtonLabel>
        </ButtonWrapper>
        <ButtonWrapper>
          <Button onClick={unlockDoor}>
            <MaterialSymbolsLockOpenOutline />
          </Button>
          <ButtonLabel>{t('UNLOCK')}</ButtonLabel>
        </ButtonWrapper>
        <ButtonWrapper>
          <Button onClick={openDoor}>
            <MaterialSymbolsDoorOpenOutline />
          </Button>
          <ButtonLabel>{t('OPEN')}</ButtonLabel>
        </ButtonWrapper>
      </ButtonContainer>
      <StatusText>
        {isUncertain ? '' : (isUnlocked ? t('UNLOCKED') : t('LOCKED'))}
      </StatusText>
      <StyledTypography uncertain={isUncertain}>
        {t('DOOR_STATE_UNKNOWN')}
      </StyledTypography>
    </Card>
  );
};
