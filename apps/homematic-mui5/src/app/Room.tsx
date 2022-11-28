import {
  Box,
  CircularProgress,
  Container,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Switch,
  Typography,
} from '@mui/material';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import {
  ChannelType,
  useChannelForRoom,
  useGetParamSet,
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

interface ThermostatResponse {
  ACTIVE_PROFILE: string;
  ACTUAL_TEMPERATURE: string;
  ACTUAL_TEMPERATURE_STATUS: string;
  BOOST_MODE: string;
  BOOST_TIME: string;
  FROST_PROTECTION: string;
  HEATING_COOLING: string;
  HUMIDITY: string;
  HUMIDITY_STATUS: string;
  PARTY_MODE: string;
  QUICK_VETO_TIME: string;
  SET_POINT_MODE: string;
  SET_POINT_TEMPERATURE: string;
  SWITCH_POINT_OCCURED: string;
  WINDOW_STATE: string;
}

export const ThermostatControl = ({ address }: { address: string }) => {
  //const actualTemperatureQueryInfo = useGetValue(address, 'ACTUAL_TEMPERATURE');
  //const humidityQueryInfo = useGetValue(address, 'HUMIDITY');

  const response = useGetParamSet<ThermostatResponse>(address);
  const result = response.data?.data.result;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
      <Typography variant="caption" sx={{ mr: 1 }}>
        {result?.SET_POINT_MODE === '1' ? 'Manuell' : 'Auto'}
      </Typography>
      <Typography variant="caption" sx={{ mr: 1 }}>
        {result?.HUMIDITY ? Number(result?.HUMIDITY) : null}%
      </Typography>
      <Typography variant="caption">
        {result?.ACTUAL_TEMPERATURE
          ? Number(result?.ACTUAL_TEMPERATURE).toLocaleString('de-DE', {
              maximumFractionDigits: 2,
              minimumFractionDigits: 2,
            })
          : null}
        °
      </Typography>
    </Box>
  );
};

export const BlindsControl = ({ address, valueKey }: ControlProps) => {
  const getChannelValueQueryInfo = useGetValue(address, valueKey);
  const setValueMutation = useSetValueMutation();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap' }}>
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

  const [searchParams] = useSearchParams()

  const channelIds = searchParams.get('channelIds')?.split(',')

  const result = useChannelForRoom(channelIds);

  if (result.isFetched && result.channelsForRoom) {
    return (
      <Container maxWidth="md">
        <List>
          {result.channelsForRoom.map((channel, index) => (
            <Box key={index}>
              <ListItem disablePadding key={channel.id} sx={{ height: '48px' }}>
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
                <ListItemText
                  primary={channel.name}
                  sx={{
                    "& .MuiListItemText-primary": {
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                    }
                  }}
                />

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
              {result.channelsForRoom?.length === index + 1 ? null : (
                <Divider />
              )}
            </Box>
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
