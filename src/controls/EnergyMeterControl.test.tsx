import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '../test/render';
import { EnergyMeterControl } from './EnergyMeterControl';
import { EnergyMeterChannel } from '../types/types';

const meter = (address: string, datapoints: EnergyMeterChannel['datapoints']) =>
  ({
    id: 1,
    name: 'Waschmaschine',
    address,
    interfaceName: 'HmIP-RF',
    type: 'ENERGIE_METER_TRANSMITTER',
    datapoints,
  }) as EnergyMeterChannel;

describe('EnergyMeterControl', () => {
  it('shows voltage, current and frequency of a measuring plug, as powermeter.fn', () => {
    renderWithTheme(
      <EnergyMeterControl
        channels={[meter('A:6', { POWER: 0, ENERGY_COUNTER: 0, VOLTAGE: 231.4, CURRENT: 0, FREQUENCY: 50.02 })]}
      />,
    );
    // Switched off and new: still electricity, not "no meter data"
    expect(screen.getByText(/^(Strom|Electricity)$/)).toBeTruthy();
    expect(screen.getByText(/^231[,.]4 V$/)).toBeTruthy();
    expect(screen.getByText('0 mA')).toBeTruthy();
    expect(screen.getByText(/^50 Hz$/)).toBeTruthy();
  });

  it('tells gas from electricity on an HmIP-ESI by the values', () => {
    renderWithTheme(
      <EnergyMeterControl
        channels={[meter('B:1', { POWER: 0, GAS_FLOW: 0.5 }), meter('B:3', { GAS_VOLUME: 1234.5 })]}
      />,
    );
    expect(screen.getByText(/^Gas$/)).toBeTruthy();
    expect(screen.queryByText(/^(Strom|Electricity)$/)).toBeNull();
  });
});
