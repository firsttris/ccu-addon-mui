import {
  Box,
  CardContent,
  CardHeader,
  LinearProgress,
  Typography,
} from '@mui/material';
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
    <Box>
      <CardHeader
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <Icon
              icon="mdi:radiator-coil"
              color={getColor(value)}
              fontSize={'40px'}
            />
            <Typography>{props.channel.name}</Typography>
          </Box>
        }
      />

      <CardContent sx={{ pt: '0px'}}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ width: '100%', mr: 1 }}>
            <LinearProgress variant="determinate" value={value} />
          </Box>
          <Box>
            <Typography variant="caption">{`${value}%`}</Typography>
          </Box>
        </Box>
      </CardContent>
    </Box>
  );
};
