import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithTheme } from '../../test/render';
import { TileNameDialog } from './TileNameDialog';

const fields = [
  { id: 1, ccuName: 'Wandtaster Flur oben', name: 'Licht' },
  { id: 2, ccuName: 'Wandtaster Flur unten', name: '' },
];

describe('TileNameDialog', () => {
  it('gives each channel of a device its own field, labelled with its CCU name', () => {
    const apply = vi.fn();
    renderWithTheme(<TileNameDialog fields={fields} onApply={apply} onClose={() => {}} />);
    const lower = screen.getByRole('textbox', { name: 'Wandtaster Flur unten' });
    expect((screen.getByRole('textbox', { name: 'Wandtaster Flur oben' }) as HTMLInputElement).value).toBe('Licht');
    fireEvent.change(lower, { target: { value: ' Rollo ' } });
    fireEvent.click(screen.getByRole('button', { name: /^(Übernehmen|Apply)$/ }));
    expect(apply).toHaveBeenCalledWith({ 1: 'Licht', 2: 'Rollo' });
  });

  it("gives all channels the CCU's names back at once", () => {
    const apply = vi.fn();
    renderWithTheme(<TileNameDialog fields={fields} onApply={apply} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^(Namen der CCU|CCU names)$/ }));
    expect(apply).toHaveBeenCalledWith({ 1: '', 2: '' });
  });

  it('keeps the one field of a channel tile as before', () => {
    const apply = vi.fn();
    renderWithTheme(
      <TileNameDialog fields={[{ id: 1, ccuName: 'RMZ VT:1', name: '' }]} onApply={apply} onClose={() => {}} />,
    );
    expect(screen.getByText(/„RMZ VT:1“|"RMZ VT:1"/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /^(Name der CCU|CCU name)$/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.change(screen.getByRole('textbox', { name: /^(Name der Kachel|Tile name)$/ }), {
      target: { value: 'Alles aus' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^(Übernehmen|Apply)$/ }));
    expect(apply).toHaveBeenCalledWith({ 1: 'Alles aus' });
  });
});
