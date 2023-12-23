import {
  Box,
  IconButton,
  ListItemText,
  Slider,
  Typography,
} from '@mui/material';

import {
  HeatingClimateControlTransceiverChannel,
  useSetValueMutation,
} from '../hooks/useApi';
import ThermostatOutlinedIcon from '@mui/icons-material/ThermostatOutlined';
import ThermostatAutoIcon from '@mui/icons-material/ThermostatAuto';
import WaterDamageOutlinedIcon from '@mui/icons-material/WaterDamageOutlined';
import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';

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

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: 'center',
        width: '100%',
        justifyContent: 'space-between',
        mr: { xs: 0, sm: '20px' },
        mb: '5px'
      }}
    >
      <Box
        sx={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
        }}
      >
        <Box sx={{ display: 'flex' }}>
          <ThermostatOutlinedIcon
            sx={{
              color: getColor(Number(datapoints?.ACTUAL_TEMPERATURE)),
            }}
          />
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
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', width: '95%', alignItems: 'center', mt: '5px' }}>
        <Box sx={{ width: '100%'}}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {datapoints?.HUMIDITY ? 
            <Box
              sx={{
                display: 'flex',
                gap: '3px',
                alignItems: 'center',
              }}
            >
              <WaterDamageOutlinedIcon />
              <Typography variant="caption">
                {Number(datapoints?.HUMIDITY)}%
              </Typography>
            </Box> : null}

            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <IconButton
                sx={{ padding: 0, color: 'black' }}
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
              >
                {pointMode ? (
                  <ThermostatOutlinedIcon />
                ) : (
                  <ThermostatAutoIcon />
                )}
              </IconButton>
              <Typography variant="caption">
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
            </Box>

            <Box sx={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
              <Icon icon="mdi:target" />
              <Typography variant="caption">
                {pointTemp.toLocaleString('de-DE', {
                  maximumFractionDigits: 2,
                  minimumFractionDigits: 2,
                })}
                °C
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box sx={{ width: '100%' }}>
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
              margin: 0,
              '& .MuiSlider-thumb': {
                height: 30, // adjust this value to change the thickness of the thumb
                width: 30, // adjust this value to change the thickness of the thumb
              },
              '& .MuiSlider-markLabel': {
                fontSize: '11px',
              },
            }}
          />
        </Box>
      </Box>
    </Box>
  );
};
