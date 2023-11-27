import { Box, IconButton, ListItemText, Typography } from '@mui/material';
import { BlindVirtualReceiverChannel, interfaceName, useSetValueMutation } from '../hooks/useApi';
import BlindsOutlinedIcon from '@mui/icons-material/BlindsOutlined';
import BlindsClosedIcon from '@mui/icons-material/BlindsClosed';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import StopIcon from '@mui/icons-material/Stop';

interface ControlProps {
  channel: BlindVirtualReceiverChannel
}

export const BlindsControl = ({
  channel
}: ControlProps) => {
  const setValueMutation = useSetValueMutation();
  const blindValue = Number(channel.datapoints.LEVEL);
  const name = channel.name;
  const address = channel.address;
  return (
    <>
      {blindValue === 1 ? <BlindsOutlinedIcon /> : <BlindsClosedIcon />}
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
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap' }}>
        <Typography variant="caption">{blindValue * 100 + '%'}</Typography>
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
    </>
  );
};
