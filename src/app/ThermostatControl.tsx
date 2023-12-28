import { Box, Button, CardContent, Slider, Typography } from '@mui/material';

import {
  HeatingClimateControlTransceiverChannel,
  useSetValueMutation,
} from '../hooks/useApi';
import { useEffect, useState } from 'react';
import { CircularProgressWithLabel } from './components/CircularProgressWithLabel';
import { StyledHeaderIcon, StyledIconButton } from './components/StyledIcons';
import { ChannelHeader } from './components/ChannelHeader';

interface ControlProps {
  channel: HeatingClimateControlTransceiverChannel;
}

export const ThermostatControl = ({ channel }: ControlProps) => {
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
    return (datapoints?.LEVEL ? (
      <Box>
        <StyledHeaderIcon
          icon="mdi:pipe-valve"
          style={{ marginRight: '5px' }}
        />
        <CircularProgressWithLabel
          value={Number(datapoints?.LEVEL)}
        />
      </Box>
    ) : null)
  }

  const getActualTemperature = () => {
    return (<Box sx={{ display: 'flex', alignItems: 'center' }}>
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
        ? Number(datapoints?.ACTUAL_TEMPERATURE).toLocaleString(
            'de-DE',
            {
              maximumFractionDigits: 2,
              minimumFractionDigits: 2,
            }
          )
        : null}
      °C
    </Typography>
  </Box>)
  }


  const getTargetTemperature = () => {
    return (<Box sx={{ display: 'flex', alignItems: 'center' }}>
    <StyledHeaderIcon icon="mdi:target" />
    <Typography variant="caption" ml="2px">
      {pointTemp.toLocaleString('de-DE', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      })}
      °C
    </Typography>
  </Box>)
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <ChannelHeader name={name} icon="mdi:thermostat-cog" />
      <CardContent sx={{ paddingTop: 0, px: '10px' }}>
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
              width: '90%',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              {getHumidity()}

              {getValveLevel()}
            </Box>

            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                mt: '5px',
              }}
            >
              {getActualTemperature()}

              {getTargetTemperature()}
            </Box>
          </Box>

          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              mt: '10px',
              width: '90%',
            }}
          >
            <StyledIconButton
              icon="ph:minus"
              onClick={() => changeSetPointTemperature(pointTemp - 1)}
            />
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Button
                  sx={{ padding: 0, fontSize: '10px' }}
                  variant="contained"
                >
                  {pointMode ? 'Manuell' : 'Auto'}
                </Button>
                <Button
                  sx={{ padding: 0, fontSize: '10px', mt: '3px' }}
                  variant="contained"
                >
                  Boost
                </Button>
              </Box>
            </Box>
            <StyledIconButton
              icon="ph:plus"
              onClick={() => changeSetPointTemperature(pointTemp + 1)}
            />
          </Box>

          <Box sx={{ width: '90%', mt: '10px' }}>
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
        </Box>
      </CardContent>
    </Box>
  );
};
