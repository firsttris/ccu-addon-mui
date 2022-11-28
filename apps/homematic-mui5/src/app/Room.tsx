import {
  Box,
  CircularProgress,
  Container,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Switch,
  Typography,
} from '@mui/material';
import { useParams } from 'react-router-dom';
import {
  ChannelType,
  useChannelForRoom,
  useGetValue,
  useSetValueMutation,
} from '../hooks/useApi';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import BlindsOutlinedIcon from '@mui/icons-material/BlindsOutlined';
import ThermostatOutlinedIcon from '@mui/icons-material/ThermostatOutlined';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import StopIcon from '@mui/icons-material/Stop';

interface ControlProps {
  address: string;
  valueKey: string;
}
export const LightControl = ({ address, valueKey }: ControlProps) => {
  const getChannelValueQueryInfo = useGetValue(address, valueKey);

  const setValueMutation = useSetValueMutation();

  const checked = getChannelValueQueryInfo.data?.data.result === '1';

  return (
    <Switch
      edge="end"
      onChange={async () => {
        await setValueMutation.mutateAsync({
          address,
          valueKey,
          type: 'boolean',
          value: !checked,
        });
        await getChannelValueQueryInfo.refetch();
      }}
      checked={checked}
      inputProps={{
        'aria-labelledby': 'switch-list-label-wifi',
      }}
    />
  );
};

export const ThermostatControl = ({ address }: { address: string }) => {
  const actualTemperatureQueryInfo = useGetValue(address, 'ACTUAL_TEMPERATURE');
  const humidityQueryInfo = useGetValue(address, 'HUMIDITY');

  return (
    <Box>
      <Typography variant="caption" sx={{ mr: 3 }}>
        {Number(humidityQueryInfo.data?.data.result)}%
      </Typography>
      <Typography variant="caption">
        {Number(actualTemperatureQueryInfo.data?.data.result)}°
      </Typography>
    </Box>
  );
};

export const BlindsControl = ({ address, valueKey }: ControlProps) => {
  const getChannelValueQueryInfo = useGetValue(address, valueKey);
  const setValueMutation = useSetValueMutation();
  return (
    <Box>
      <Typography variant="caption">
        {Number(getChannelValueQueryInfo.data?.data.result) * 100 + '%'}
      </Typography>
      <IconButton
        onClick={() =>
          setValueMutation.mutateAsync({
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
            address,
            valueKey,
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
            address,
            valueKey,
            type: 'double',
            value: 1,
          })
        }
      >
        <ArrowUpwardIcon />
      </IconButton>
    </Box>
  );
};

export const Room = () => {
  const { roomId } = useParams();

  const result = useChannelForRoom(roomId);

  if (result.isFetched && result.channelsForRoom) {
    return (
      <Container maxWidth="md">
        <List>
          {result.channelsForRoom.map((channel) => (
            <ListItem disablePadding key={channel.id}>
              <ListItemButton>
                <ListItemIcon>
                  {channel.channelType ===
                  ChannelType.SWITCH_VIRTUAL_RECEIVER ? (
                    <LightbulbOutlinedIcon />
                  ) : null}
                  {channel.channelType ===
                  ChannelType.BLIND_VIRTUAL_RECEIVER ? (
                    <BlindsOutlinedIcon />
                  ) : null}
                  {channel.channelType ===
                  ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER ? (
                    <ThermostatOutlinedIcon />
                  ) : null}
                </ListItemIcon>
                <ListItemText primary={channel.name} />
              </ListItemButton>
              {channel.channelType === ChannelType.SWITCH_VIRTUAL_RECEIVER ? (
                <LightControl address={channel.address} valueKey={'STATE'} />
              ) : null}
              {channel.channelType ===
              ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER ? (
                <ThermostatControl address={channel.address} />
              ) : null}
              {channel.channelType === ChannelType.BLIND_VIRTUAL_RECEIVER ? (
                <BlindsControl address={channel.address} valueKey={'LEVEL'} />
              ) : null}
            </ListItem>
          ))}
        </List>
      </Container>
    );
  } else if (result.isLoading) {
    return (
      <Box
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <CircularProgress />
      </Box>
    );
  } else {
    return null;
  }
};
