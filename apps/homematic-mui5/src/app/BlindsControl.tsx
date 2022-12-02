import { Box, IconButton, ListItemText, Typography } from '@mui/material';
import { useGetValue, useSetValueMutation } from '../hooks/useApi';
import BlindsOutlinedIcon from '@mui/icons-material/BlindsOutlined';
import BlindsClosedIcon from '@mui/icons-material/BlindsClosed';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import StopIcon from '@mui/icons-material/Stop';

interface ControlProps {
  interfaceName: string;
  address: string;
  name: string;
}

export const BlindsControl = ({
  name,
  address,
  interfaceName,
}: ControlProps) => {
  const adressAndIndex = address.split(':');
  const statusIndex = Number(adressAndIndex[1]) - 1;
  const getChannelValueQueryInfo = useGetValue(
    interfaceName,
    `${adressAndIndex[0]}:${statusIndex}`,
    'LEVEL'
  );
  const setValueMutation = useSetValueMutation();
  const blindValue = Number(getChannelValueQueryInfo.data?.data.result);
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
