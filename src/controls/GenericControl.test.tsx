import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { GenericControlView as GenericControl } from './GenericControl';
import { renderWithTheme } from '../test/render';
import type { GenericChannel } from '../types/types';

const channel: GenericChannel = {
  id: 1,
  name: 'Fenstergriff',
  address: 'A:1',
  interfaceName: 'HmIP-RF',
  type: 'ROTARY_HANDLE_TRANSCEIVER',
  datapoints: { STATE: 2, SABOTAGE: false, TEMPERATURE: 21.456, ERROR: null, TEXT: 'ok' },
};

describe('GenericControl', () => {
  it('lists all datapoints sorted by name with formatted values', () => {
    renderWithTheme(<GenericControl channel={channel} />);

    const list = screen.getByLabelText('Fenstergriff');
    const terms = within(list)
      .getAllByRole('term')
      .map((el) => el.textContent);
    const values = within(list)
      .getAllByRole('definition')
      .map((el) => el.textContent);
    expect(terms).toEqual(['ERROR', 'SABOTAGE', 'STATE', 'TEMPERATURE', 'TEXT']);
    expect(values[0]).toBe('–');
    expect(values[1]).toMatch(/^(No|Nein)$/);
    expect(values[2]).toBe('2');
    expect(values[3]).toMatch(/^21[.,]46$/);
    expect(values[4]).toBe('ok');
  });

  it('links to the CCU WebUI', () => {
    renderWithTheme(<GenericControl channel={channel} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/');
  });
});
