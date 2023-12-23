import {
  Box,
  CircularProgress,
  CircularProgressProps,
  IconButton,
  ListItemText,
  Typography,
} from '@mui/material';
import {
  BlindVirtualReceiverChannel,
  useSetValueMutation,
} from '../hooks/useApi';
import BlindsOutlinedIcon from '@mui/icons-material/BlindsOutlined';
import BlindsClosedIcon from '@mui/icons-material/BlindsClosed';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import StopIcon from '@mui/icons-material/Stop';

interface ControlProps {
  channel: BlindVirtualReceiverChannel;
}

const CircularProgressWithLabel = (
  props: CircularProgressProps & { value: number }
) => {
  return (
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      <CircularProgress variant="determinate" {...props} />
      <Box
        sx={{
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          position: 'absolute',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography
          variant="caption"
          component="div"
          color="text.secondary"
        >{`${Math.round(props.value)}%`}</Typography>
      </Box>
    </Box>
  );
};

export const BlindsControl = ({ channel }: ControlProps) => {
  const setValueMutation = useSetValueMutation();
  const { datapoints, name, address, interfaceName } = channel;
  const blindValue = Number(datapoints.LEVEL) * 100;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        {blindValue === 0 ? <BlindsClosedIcon /> : <BlindsOutlinedIcon />}
        <ListItemText
          primary={name}
          sx={{
            marginLeft: '10px',
            '& .MuiListItemText-primary': {
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            },
          }}
        />
        <CircularProgressWithLabel value={blindValue} />
      </Box>
      <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
        <Box sx={{ display: 'flex', gap: '5px' }}>
          <IconButton
            onClick={() =>
              setValueMutation.mutateAsync({
                interface: interfaceName,
                address,
                valueKey: 'STOP',
                type: 'boolean',
                value: true,
              })
            }
          >
            <StopIcon />
          </IconButton>
          <IconButton
            onClick={() =>
              setValueMutation.mutateAsync({
                interface: interfaceName,
                address,
                valueKey: 'LEVEL',
                type: 'double',
                value: 0,
              })
            }
          >
            <ArrowDownwardIcon />
          </IconButton>
          <IconButton
            onClick={() =>
              setValueMutation.mutateAsync({
                interface: interfaceName,
                address,
                valueKey: 'LEVEL',
                type: 'double',
                value: 1,
              })
            }
          >
            <ArrowUpwardIcon />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
};
