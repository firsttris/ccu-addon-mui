import { Box, CardHeader, Typography, styled } from '@mui/material';
import { RainDetectionTransmitterChannel } from './../../types/types';
import { StyledHeaderIcon } from '../components/StyledIcons';

const StyledBox = styled(Box)({
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
    gap: '20px'
  });
  
  const StyledIconBox = styled(Box)({
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  });
  

interface RainDetectionControlProps {
  channel: RainDetectionTransmitterChannel;
}

export const RainDetectionControl: React.FC<RainDetectionControlProps> = ({
  channel,
}) => {
  const {
    datapoints: { HEATER_STATE, RAINING },
  } = channel;

  const isRaining = RAINING === 'true';
  const isHeating = HEATER_STATE === 'true';

  return (
    <CardHeader
      title={
        <StyledBox>
          <StyledIconBox>
            {isRaining ? (
              <StyledHeaderIcon icon="mdi:weather-heavy-rain" color="#0077B6" />
            ) : (
              <StyledHeaderIcon icon="mdi:clouds" />
            )}
            <Typography variant="caption">{isRaining ? 'Raining' : 'Not Raining'}</Typography>
          </StyledIconBox>
          <StyledIconBox>
            {isHeating ? (
              <StyledHeaderIcon
                icon="material-symbols:mode-heat"
                color="#FF4500"
              />
            ) : (
              <StyledHeaderIcon icon="material-symbols:mode-heat-off" />
            )}
            <Typography variant="caption">{isHeating ? 'Heating' : 'Not Heating'}</Typography>
          </StyledIconBox>
        </StyledBox>
      }
    />
  );
};
