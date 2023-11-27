import { Box, IconButton, ListItemText, Typography } from '@mui/material';
import { useSetValueMutation } from '../hooks/useApi';
import BlindsOutlinedIcon from '@mui/icons-material/BlindsOutlined';
import BlindsClosedIcon from '@mui/icons-material/BlindsClosed';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import StopIcon from '@mui/icons-material/Stop';

interface ControlProps {
  interfaceName: string;
  address: string;
  name: string;
  blindValue: number;
}

export const BlindsControl = ({
  name,
  address,
  interfaceName,
  blindValue
}: ControlProps) => {
  const setValueMutation = useSetValueMutation();
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
