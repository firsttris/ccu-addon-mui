import {
  Box,
  CardContent,
  CardHeader,
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
import { CircularProgressWithLabel } from './components/CircularProgressWithLabel';
import { IconButtonWithHover } from './components/IconButtonWithHover';
import { TypographyWithEllipsis } from './components/TypographyWithEllipsis';

interface ControlProps {
  channel: BlindVirtualReceiverChannel;
}

export const BlindsControl = ({ channel }: ControlProps) => {
  const setValueMutation = useSetValueMutation();
  const { datapoints, name, address, interfaceName } = channel;
  const blindValue = Number(datapoints.LEVEL) * 100;
  return (
    <Box>
      <CardHeader
        title={
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {blindValue === 0 ? (
              <BlindsClosedIcon sx={{ fontSize: '30px' }} />
            ) : (
              <BlindsOutlinedIcon sx={{ fontSize: '30px' }} />
            )}
            <TypographyWithEllipsis>{name}</TypographyWithEllipsis>
          </Box>
        }
      />

      <CardContent sx={{ paddingTop: '0px'}}>
        <Box
          sx={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Box sx={{ display: 'flex', gap: '5px', alignItems: 'center', justifyContent: 'center' }}>
            <IconButtonWithHover
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
            </IconButtonWithHover>
            <IconButtonWithHover
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
            </IconButtonWithHover>
            <IconButtonWithHover
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
            </IconButtonWithHover>
            <Box>
              <CircularProgressWithLabel value={blindValue} />
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Box>
  );
};
