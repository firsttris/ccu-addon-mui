import { Box, IconButton, ListItemText } from '@mui/material';
import {
  BlindVirtualReceiverChannel,
  useSetValueMutation,
} from '../hooks/useApi';
import BlindsOutlinedIcon from '@mui/icons-material/BlindsOutlined';
import BlindsClosedIcon from '@mui/icons-material/BlindsClosed';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import StopIcon from '@mui/icons-material/Stop';
import { CircularProgressWithLabel } from './components/CircularProgressWithLabel';

interface ControlProps {
  channel: BlindVirtualReceiverChannel;
}

export const BlindsControl = ({ channel }: ControlProps) => {
  const setValueMutation = useSetValueMutation();
  const { datapoints, name, address, interfaceName } = channel;
  const blindValue = Number(datapoints.LEVEL) * 100;
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        mb: '-10px',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        {blindValue === 0 ? (
          <BlindsClosedIcon sx={{ fontSize: '40px', ml: '5px' }} />
        ) : (
          <BlindsOutlinedIcon sx={{ fontSize: '40px', ml: '5px' }} />
        )}
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
      </Box>
      <Box
        sx={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          mt: '-5px',
        }}
      >
        <Box sx={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
          <IconButton
            sx={{
              backgroundColor: 'grey',
              borderRadius: '10px',
              '&:hover': {
                backgroundColor: 'darkgrey',
              },
            }}
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
            <ArrowDownwardIcon sx={{ fontSize: '45px' }} />
          </IconButton>
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
            <StopIcon sx={{ fontSize: '45px' }} />
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
            <ArrowUpwardIcon sx={{ fontSize: '45px' }} />
          </IconButton>
          <Box>
            <CircularProgressWithLabel value={blindValue} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
