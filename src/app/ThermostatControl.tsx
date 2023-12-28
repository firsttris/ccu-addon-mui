import {
  Box,
  Button,
  CardContent,
  CardHeader,
  IconButton,
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
import { CircularProgressWithLabel } from './components/CircularProgressWithLabel';
import { TypographyWithEllipsis } from './components/TypographyWithEllipsis';
import { IconButtonWithHover } from './components/IconButtonWithHover';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';

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

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <CardHeader
        title={
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ThermostatOutlinedIcon
              sx={{
                color: getColor(Number(datapoints?.ACTUAL_TEMPERATURE)),
                fontSize: '30px',
              }}
            />
            <TypographyWithEllipsis>{name}</TypographyWithEllipsis>
          </Box>
        }
      />

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
              {datapoints?.HUMIDITY ? (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <WaterDamageOutlinedIcon sx={{ fontSize: '30px' }} />
                  <Typography variant="caption" mt="4px" ml="3px">
                    {Number(datapoints?.HUMIDITY)}%
                  </Typography>
                </Box>
              ) : null}

              {datapoints?.LEVEL ? (
                <Box>
                  <Icon icon="mdi:pipe-valve" fontSize="30px" style={{ marginRight: '5px'}} />
                  <CircularProgressWithLabel
                    value={Number(datapoints?.LEVEL)}
                  />
                </Box>
              ) : null}
            </Box>

            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                mt: '5px',
              }}
            >
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
                    <ThermostatOutlinedIcon sx={{ fontSize: '30px' }} />
                  ) : (
                    <ThermostatAutoIcon sx={{ fontSize: '30px' }} />
                  )}
                </IconButton>

                <Typography variant="caption" mt="4px">
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

              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Icon icon="mdi:target" fontSize="30px" />
                <Typography variant="caption" mt="4px" ml="3px">
                  {pointTemp.toLocaleString('de-DE', {
                    maximumFractionDigits: 2,
                    minimumFractionDigits: 2,
                  })}
                  °C
                </Typography>
              </Box>
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
            <IconButtonWithHover
              onClick={() => changeSetPointTemperature(pointTemp - 1)}
            >
              <Icon icon="ph:minus" fontSize="45px" />
            </IconButtonWithHover>

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

            <IconButtonWithHover
              onClick={() => changeSetPointTemperature(pointTemp + 1)}
            >
              <Icon icon="ph:plus" fontSize="45px" />
            </IconButtonWithHover>
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
