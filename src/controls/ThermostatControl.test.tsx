import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithTheme } from '../test/render';
import { Channel } from '../types/types';

const setDataPoint = vi.fn();
vi.mock('../queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../queries')>()),
  useParamset: () => ({ data: undefined }),
  useSetDataPoint: () => setDataPoint,
  useWeekProfile: () => ({ data: undefined }),
  useDevices: () => ({ data: undefined }),
}));
vi.mock('./ThermostatControl/profile/WeekProfileSheet', () => ({ WeekProfileSheet: () => null }));
vi.mock('../components/DeviceImage', () => ({
  DeviceImage: () => null,
  useDeviceImage: () => undefined,
  useDeviceImages: () => ({ isPending: false }),
}));

const { ThermostatControl } = await import('./ThermostatControl');

const channel = (type: string, interfaceName: string, datapoints: Record<string, unknown>) =>
  ({ id: 1, name: 'Bad', address: 'A:1', interfaceName, type, datapoints }) as Channel;

const boost = /Boost/;

describe('ThermostatControl', () => {
  it('offers boost on an HmIP wall thermostat too, as the WebUI', () => {
    renderWithTheme(
      <ThermostatControl
        channel={channel('HEATING_CLIMATECONTROL_TRANSCEIVER', 'HmIP-RF', {
          SET_POINT_TEMPERATURE: 21,
          ACTUAL_TEMPERATURE: 20,
          SET_POINT_MODE: 0,
          BOOST_MODE: false,
        })}
      />,
    );
    expect(screen.getByRole('button', { name: boost })).toBeTruthy();
  });

  it('shows the holiday mode instead of "Auto"', () => {
    renderWithTheme(
      <ThermostatControl
        channel={channel('HEATING_CLIMATECONTROL_TRANSCEIVER', 'HmIP-RF', {
          SET_POINT_TEMPERATURE: 17,
          ACTUAL_TEMPERATURE: 20,
          SET_POINT_MODE: 2,
          BOOST_MODE: false,
        })}
      />,
    );
    expect(screen.getByText(/^(Urlaub|Holiday)$/)).toBeTruthy();
  });

  it('sets comfort and lowering temperature on BidCos thermostats', () => {
    setDataPoint.mockClear();
    renderWithTheme(
      <ThermostatControl
        channel={channel('CLIMATECONTROL_RT_TRANSCEIVER', 'BidCos-RF', {
          SET_TEMPERATURE: 21,
          ACTUAL_TEMPERATURE: 20,
          CONTROL_MODE: 0,
          BOOST_MODE: false,
          COMFORT_MODE: false,
          LOWERING_MODE: false,
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^(Komforttemperatur|Comfort temperature)$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^(Eco-Temperatur|Reduction temperature)$/ }));
    expect(setDataPoint.mock.calls.map((c) => c[2])).toEqual(['COMFORT_MODE', 'LOWERING_MODE']);
  });

  it('shows no boost where the device has none', () => {
    renderWithTheme(
      <ThermostatControl
        channel={channel('HEATING_CLIMATECONTROL_TRANSCEIVER', 'HmIP-RF', {
          SET_POINT_TEMPERATURE: 21,
          ACTUAL_TEMPERATURE: 20,
          SET_POINT_MODE: 0,
        })}
      />,
    );
    expect(screen.queryByRole('button', { name: boost })).toBeNull();
  });
});
