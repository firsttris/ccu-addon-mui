import { Box, CardContent } from '@mui/material';
import {
  useSetValueMutation,
} from '../../hooks/useApi';
import { CircularProgressWithLabel } from '../components/CircularProgressWithLabel';
import { StyledIconButton } from '../components/StyledIcons';
import { ChannelHeader } from '../components/ChannelHeader';
import { BlindVirtualReceiverChannel } from 'src/types/types';

interface ControlProps {
  channel: BlindVirtualReceiverChannel;
}

export const BlindsControl = ({ channel }: ControlProps) => {
  const setValueMutation = useSetValueMutation();
  const { datapoints, name, address, interfaceName } = channel;
  const blindValue = Number(datapoints.LEVEL) * 100;
  return (
    <Box>
      <ChannelHeader icon={blindValue === 0 ? "material-symbols-light:blinds-closed" : "material-symbols-light:blinds"} name={name}/>
      <CardContent sx={{ paddingTop: '0px' }}>
        <Box
          sx={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              gap: '5px',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <StyledIconButton
              icon="uiw:down"
              onClick={() =>
                setValueMutation.mutateAsync({
                  interface: interfaceName,
                  address,
                  valueKey: 'LEVEL',
                  type: 'double',
                  value: 0,
                })
              }
            />

            <StyledIconButton
              icon="material-symbols:stop"
              onClick={() =>
                setValueMutation.mutateAsync({
                  interface: interfaceName,
                  address,
                  valueKey: 'STOP',
                  type: 'boolean',
                  value: true,
                })
              }
            />

            <StyledIconButton
              icon="uiw:up"
              onClick={() =>
                setValueMutation.mutateAsync({
                  interface: interfaceName,
                  address,
                  valueKey: 'LEVEL',
                  type: 'double',
                  value: 1,
                })
              }
            />

            <Box>
              <CircularProgressWithLabel value={blindValue} />
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Box>
  );
};
