import {
  Box,
  CircularProgress,
  Container,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Slider,
  Switch,
  Typography,
} from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import {
  ChannelType,
  useChannelForRoom,
  useGetParamSet,
  useGetValue,
  useSetValueMutation,
} from '../hooks/useApi';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import BlindsOutlinedIcon from '@mui/icons-material/BlindsOutlined';
import BlindsClosedIcon from '@mui/icons-material/BlindsClosed';
import ThermostatOutlinedIcon from '@mui/icons-material/ThermostatOutlined';
import ThermostatAutoIcon from '@mui/icons-material/ThermostatAuto';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import StopIcon from '@mui/icons-material/Stop';
import WaterDamageOutlinedIcon from '@mui/icons-material/WaterDamageOutlined';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import { useEffect, useState } from 'react';

interface ControlProps {
  interfaceName: string;
  address: string;
  name: string;
}
export const LightControl = ({ name, address, interfaceName }: ControlProps) => {
  const getChannelValueQueryInfo = useGetValue(interfaceName, address, 'STATE');

  const setValueMutation = useSetValueMutation();

  const checked = getChannelValueQueryInfo.data?.data.result === '1';

  return (
    <>
      {checked ? (
        <LightbulbIcon sx={{ color: 'orange' }} />
      ) : (
        <LightbulbOutlinedIcon />
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
      <Switch
        edge="end"
        onChange={async () => {
          await setValueMutation.mutateAsync({
            interface: interfaceName,
            address,
            valueKey: 'STATE',
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
    </>
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

export const ThermostatControl = ({ name, address, interfaceName }: ControlProps) => {
  const marks = [
    {
      value: 10,
      label: '10°C',
    },

    {
      value: 20,
      label: '20°C',
    },

    {
      value: 30,
      label: '30°C',
    },
  ];

  const setValueMutation = useSetValueMutation();
  const response = useGetParamSet<ThermostatResponse>(interfaceName, address);
  const result = response.data?.data.result;
  const setPoinTemperatureResult = Number(result?.SET_POINT_TEMPERATURE ?? 0);
  const [pointTemp, setPointTemp] = useState<number>(setPoinTemperatureResult);
  const setPointModeResult = Number(result?.SET_POINT_MODE ?? 0)
  const [pointMode, setPointMode] = useState<number>(setPointModeResult);

  useEffect(() => {
    setPointMode(setPointModeResult);
  }, [setPointModeResult]);

  useEffect(() => {
    setPointTemp(setPoinTemperatureResult);
  }, [setPoinTemperatureResult]);

  return (
    <>
      <ThermostatOutlinedIcon sx={{ color: Number(result?.ACTUAL_TEMPERATURE) < 15 ? 'blue' : Number(result?.ACTUAL_TEMPERATURE) > 15 && Number(result?.ACTUAL_TEMPERATURE) < 20 ? 'orange' : 'red'}}/>
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
      <Box sx={{ display: 'flex', flexDirection: 'column', marginTop: '10px' }}>
        <Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WaterDamageOutlinedIcon sx={{ marginRight: '3px' }} />
            <Typography variant="caption" sx={{ mr: 1 }}>
              {result?.HUMIDITY ? Number(result?.HUMIDITY) : null}%
            </Typography>
            <IconButton
              sx={{ padding: 0, color: 'black' }}
              onClick={() => {
                setPointMode(Number(pointMode ? '0' : '1'))
                setValueMutation.mutateAsync({
                  interface: interfaceName,
                  address,
                  valueKey: 'CONTROL_MODE',
                  type: 'double',
                  value: pointMode ? 0 : 1,
                });
              }}
            >
              {pointMode ? (
                <ThermostatOutlinedIcon />
              ) : (
                <ThermostatAutoIcon />
              )}
            </IconButton>
            <Typography variant="caption" sx={{}}>
              {result?.ACTUAL_TEMPERATURE
                ? Number(result?.ACTUAL_TEMPERATURE).toLocaleString('de-DE', {
                    maximumFractionDigits: 2,
                    minimumFractionDigits: 2,
                  })
                : null}
              °C
            </Typography>
          </Box>
        </Box>

        <Box sx={{ width: 150 }}>
          <Slider
            aria-label="Temperature"
            defaultValue={30}
            getAriaValueText={(value: number) => `${value}°C`}
            getAriaLabel={(value: number) => `${value}°C`}
            valueLabelDisplay="auto"
            value={pointTemp}
            onChange={(_, value) => {
              setPointTemp(value as number);
              setValueMutation.mutateAsync({
                interface: interfaceName,
                address,
                valueKey: 'SET_POINT_TEMPERATURE',
                type: 'double',
                value: value.toString(),
              });
            }}
            step={1}
            marks={marks}
            min={5}
            max={30}
            sx={{
              '& .MuiSlider-markLabel': {
                fontSize: '11px',
              },
            }}
          />
        </Box>
      </Box>
    </>
  );
};

export const BlindsControl = ({ name, address, interfaceName }: ControlProps) => {
  const adressAndIndex = address.split(':');
  const statusIndex = Number(adressAndIndex[1]) - 1;
  const getChannelValueQueryInfo = useGetValue(interfaceName,
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

export const Room = () => {
  const [searchParams] = useSearchParams();

  const channelIds = searchParams.get('channelIds')?.split(',');

  const result = useChannelForRoom(channelIds);

  const channelsForRoom = result.channelsForRoom ?? []
  const allDevices = result.data?.data.result ?? []

  if (result.isFetched) {
    return (
      <Container maxWidth="md">
        <List>
          {channelsForRoom.map((channel, index) => {
            const splitted = channel.address.split(':')
            const interfaceName = allDevices.find(device => device.address === splitted[0])?.interface ?? ''
            return (
            <Box key={index}>
              <ListItem
                disablePadding
                key={channel.id}
                sx={{
                  minHeight: '48px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                }}
              >
                {channel.channelType === ChannelType.SWITCH_VIRTUAL_RECEIVER ? (
                  <LightControl address={channel.address} name={channel.name} interfaceName={interfaceName} />
                ) : null}
                {channel.channelType ===
                ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER ? (
                  <ThermostatControl
                    interfaceName={interfaceName}
                    address={channel.address}
                    name={channel.name}
                  />
                ) : null}
                {channel.channelType === ChannelType.BLIND_VIRTUAL_RECEIVER ? (
                  <BlindsControl
                    interfaceName={interfaceName}
                    address={channel.address}
                    name={channel.name}
                  />
                ) : null}
              </ListItem>
              {result.channelsForRoom?.length === index + 1 ? null : (
                <Divider />
              )}
            </Box>
          )})}
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
