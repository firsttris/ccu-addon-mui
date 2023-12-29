import { Box, Slider, Typography, styled } from '@mui/material';
import {
  useSetValueMutation,
} from '../../hooks/useApi';
import { useEffect, useState } from 'react';
import { CircularProgressWithLabel } from '../components/CircularProgressWithLabel';
import { StyledHeaderIcon, StyledIconButton } from '../components/StyledIcons';
import { ChannelHeader } from '../components/ChannelHeader';
import { HeatingClimateControlTransceiverChannel } from 'src/types/types';

interface ControlProps {
  channel: HeatingClimateControlTransceiverChannel;
}

const StyledButton = styled('button')(({ theme }) => ({
  backgroundColor: 'lightgrey',
  fontWeight: 'bold',
  borderRadius: '10px',
  border: 'none',
  cursor: 'pointer',
  padding: '10px',
  width: '70px',
  '&:hover, &:active, &:focus': {
    backgroundColor: 'lightgrey',
  },
}));

export const ThermostatControl = ({ channel }: ControlProps) => {
  const { datapoints, name, address, interfaceName } = channel;
  const setPointModevalue = Number(datapoints?.SET_POINT_MODE ?? 0);
  const setPoinTemperaturevalue = Number(
    datapoints?.SET_POINT_TEMPERATURE ?? 0
  );

  const setValueMutation = useSetValueMutation();

  const [pointTemp, setPointTemp] = useState<number>(setPoinTemperaturevalue);
  const [pointMode, setPointMode] = useState<number>(setPointModevalue);

  useEffect(() => {
    setPointMode(setPointModevalue);
  }, [setPointModevalue]);

  useEffect(() => {
    setPointTemp(setPoinTemperaturevalue);
  }, [setPoinTemperaturevalue]);

  const changeSetPointTemperature = (value: number) => {
    setPointTemp(value);
    setValueMutation.mutateAsync({
      interface: interfaceName,
      address,
      valueKey: 'SET_POINT_TEMPERATURE',
      type: 'double',
      value: value.toString(),
    });
  };

  const getColor = (value: number): string => {
    if (value === 0) {
      return 'black';
    } else if (value >= 0 && value < 15) {
      return 'blue';
    } else if (value >= 15 && value < 20) {
      return 'orange';
    } else if (value >= 20 && value < 25) {
      return 'red';
    } else if (value >= 25) {
      return 'purple';
    } else {
      return 'black';
    }
  };

  const getHumidity = () => {
    return datapoints?.HUMIDITY ? (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <StyledHeaderIcon icon="material-symbols-light:humidity-indoor-outline" />
        <Typography variant="caption" ml="3px">
          {Number(datapoints?.HUMIDITY)}%
        </Typography>
      </Box>
    ) : null;
  };

  const getValveLevel = () => {
    return datapoints?.LEVEL ? (
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <StyledHeaderIcon
          icon="mdi:pipe-valve"
          style={{ marginRight: '5px' }}
        />
        <CircularProgressWithLabel value={Number(datapoints?.LEVEL)} />
      </Box>
    ) : null;
  };

  const getActualTemperature = () => {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <StyledHeaderIcon
          icon={pointMode ? 'mdi:thermostat' : 'mdi:thermostat-auto'}
          color={getColor(Number(datapoints?.ACTUAL_TEMPERATURE))}
          onClick={() => {
            setPointMode(Number(pointMode ? '0' : '1'));
            setValueMutation.mutateAsync({
              interface: interfaceName,
              address,
              valueKey: 'CONTROL_MODE',
              type: 'double',
              value: pointMode ? 0 : 1,
            });
          }}
        />
        <Typography variant="caption" ml="3px">
          {datapoints?.ACTUAL_TEMPERATURE
            ? Number(datapoints?.ACTUAL_TEMPERATURE).toLocaleString('de-DE', {
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
              })
            : null}
          °C
        </Typography>
      </Box>
    );
  };

  const getTargetTemperature = () => {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <StyledHeaderIcon icon="mdi:target" />
        <Typography variant="caption" ml="2px">
          {pointTemp.toLocaleString('de-DE', {
            maximumFractionDigits: 2,
            minimumFractionDigits: 2,
          })}
          °C
        </Typography>
      </Box>
    );
  };

  const getWindowState = () => {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <StyledHeaderIcon
          icon={
            datapoints?.WINDOW_STATE === '0'
              ? 'material-symbols:window-closed'
              : 'material-symbols:window-open'
          }
        />
        <Typography variant="caption" ml="2px">
          {datapoints?.WINDOW_STATE === '0' ? 'Closed' : 'Open'}
        </Typography>
      </Box>
    );
  };

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

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <ChannelHeader name={name} icon="mdi:thermostat-cog" />
      <Box sx={{ mb: '5px' }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Box sx={{ display: 'flex', gap: '5px' }}>
              {getActualTemperature()}
              {getTargetTemperature()}
              {getHumidity()}
            </Box>
          </Box>

          <Box sx={{ width: '85%', my: '10px' }}>
            <Slider
              aria-label="Temperature"
              defaultValue={30}
              getAriaValueText={(value: number) => `${value}°C`}
              getAriaLabel={(value: number) => `${value}°C`}
              valueLabelDisplay="auto"
              value={pointTemp}
              onChange={(_, value) => {
                changeSetPointTemperature(value as number);
              }}
              step={1}
              marks={marks}
              min={5}
              max={30}
              sx={{
                margin: 0,
                '& .MuiSlider-thumb': {
                  height: 30,
                  width: 30,
                },
                '& .MuiSlider-markLabel': {
                  fontSize: '11px',
                },
              }}
            />
          </Box>

          <Box
            sx={{
              display: 'flex',
              gap: '15px',
              mt: '10px',
            }}
          >
            <StyledIconButton
              icon="ph:minus"
              onClick={() => changeSetPointTemperature(pointTemp - 1)}
            />

            <StyledIconButton
              icon="ph:plus"
              onClick={() => changeSetPointTemperature(pointTemp + 1)}
            />
          </Box>

          <Box
            sx={{
              display: 'flex',
              gap: '15px',
              mt: '10px',
            }}
          >
            <StyledButton>{pointMode ? 'Manuell' : 'Auto'}</StyledButton>
            <StyledButton>Boost</StyledButton>
          </Box>

          <Box
            sx={{
              display: 'flex',
              gap: '15px',
              mt: '10px',
            }}
          >
            {getWindowState()}

            {getValveLevel()}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
