import { Box, LinearProgress, Typography } from '@mui/material';
import { FloorClimateControlTransceiverChannel } from 'src/hooks/useApi';
import { Icon } from '@iconify/react';

interface FloorControlProps {
  channel: FloorClimateControlTransceiverChannel;
}

export const FloorControl = (props: FloorControlProps) => {
  const value = Math.round(Number(props.channel.datapoints.LEVEL) * 100);

  const getColor = (value: number): string => {
    if (value === 0) {
      return 'black';
    } else if (value >= 0 && value < 25) {
      return 'blue'; 
    } else if (value >= 25 && value < 50) {
      return 'orange'; 
    } else if (value >= 50 && value < 75) {
      return 'red'; 
    } else if (value >= 75 && value <= 100) {
      return 'purple'; 
    } else {
      return 'black';
    }
  };

  return (
    <Box sx={{ width: '100%', ml: '6px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <Icon icon="mdi:radiator-coil" color={getColor(value)} />
        <Typography>{props.channel.name}</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mt: '5px' }}>
        <Box sx={{ width: '100%', mr: 1 }}>
          <LinearProgress variant="determinate" value={value} />
        </Box>
        <Box sx={{ minWidth: 35 }}>
          <Typography
            variant="caption"
          >{`${value}%`}</Typography>
        </Box>
      </Box>
    </Box>
  );
};
