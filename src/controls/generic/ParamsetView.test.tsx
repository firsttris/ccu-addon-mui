import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { ParamsetView, shownParameters } from './ParamsetView';
import { renderWithTheme } from '../../test/render';
import { DatapointValue, ParameterDescription, ParamsetDescription } from '../../types/types';

// Raw XML-RPC description (as in the fixtures) → the JSON the server sends
const fromRaw = (raw: Record<string, Record<string, unknown>>): ParamsetDescription =>
  Object.fromEntries(
    Object.entries(raw).map(([name, p]) => [
      name,
      {
        type: p.TYPE,
        operations: p.OPERATIONS ?? 0,
        flags: p.FLAGS ?? 0,
        default: p.DEFAULT,
        min: p.MIN,
        max: p.MAX,
        unit: p.UNIT,
        tabOrder: p.TAB_ORDER ?? 0,
        control: p.CONTROL,
        valueList: p.VALUE_LIST,
        special: (p.SPECIAL as { ID: string; VALUE: DatapointValue }[] | undefined)?.map((s) => ({
          id: s.ID,
          value: s.VALUE,
        })),
      } as ParameterDescription,
    ]),
  );

type Fixture = {
  channels: { address: string; datapoints: Record<string, DatapointValue> }[];
  interfaces: Record<string, { paramsetDescriptions?: Record<string, Record<string, Record<string, Record<string, unknown>>>> }>;
};

const fixturesDir = path.resolve(__dirname, '../../../fixtures');
const fixtures = fs
  .readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => [f, JSON.parse(fs.readFileSync(path.join(fixturesDir, f), 'utf8')) as Fixture] as const);

// Gate of phase 1: every description from the fixtures renders without
// errors, with one element per shown parameter.
describe.each(fixtures)('descriptions in %s', (_, fixture) => {
  const cases = Object.entries(fixture.interfaces).flatMap(([iface, data]) =>
    Object.entries(data.paramsetDescriptions ?? {}).flatMap(([address, paramsets]) =>
      Object.entries(paramsets).map(([key, raw]) => [`${iface} ${address} ${key}`, address, fromRaw(raw)] as const),
    ),
  );

  it.each(cases)('%s renders', (label, address, description) => {
    const values = fixture.channels.find((c) => c.address === address)?.datapoints ?? {};
    renderWithTheme(<ParamsetView label={label} description={description} values={values} onSet={() => {}} />);
    const list = screen.getByLabelText(label);
    expect(within(list).queryAllByRole('term')).toHaveLength(shownParameters(description).length);
  });
});

const description: ParamsetDescription = {
  STATE: { type: 'BOOL', operations: 7, flags: 1, tabOrder: 0 },
  MODE: { type: 'ENUM', operations: 7, flags: 1, tabOrder: 1, valueList: ['AUTO', 'MANUAL'] },
  LEVEL: { type: 'FLOAT', operations: 7, flags: 1, tabOrder: 2, min: 0, max: 1, unit: '100%' },
  PRESS: { type: 'ACTION', operations: 2, flags: 1, tabOrder: 3 },
  WINDOW: { type: 'ENUM', operations: 5, flags: 1, tabOrder: 4, valueList: ['CLOSED', 'OPEN'] },
  ON_TIME: { type: 'FLOAT', operations: 2, flags: 1, tabOrder: 5, unit: 's' },
  SECRET: { type: 'BOOL', operations: 5, flags: 3, tabOrder: 6 },
  DELAY: { type: 'FLOAT', operations: 7, flags: 1, tabOrder: 7, min: 0, max: 100, special: [{ id: 'NOT_USED', value: 0 }] },
};

describe('ParamsetView', () => {
  const values = { STATE: false, MODE: 1, LEVEL: 0.25, WINDOW: 1, DELAY: 0 };

  it('shows readable and action parameters, not write-only or internal ones', () => {
    renderWithTheme(<ParamsetView label="Kanal" description={description} values={values} onSet={() => {}} />);
    const terms = screen.getAllByRole('term').map((t) => t.textContent);
    expect(terms).toEqual(['STATE', 'MODE', 'LEVEL', 'PRESS', 'WINDOW', 'DELAY']);
    expect(screen.getByText('OPEN')).toBeInTheDocument();
    expect(screen.getByText('NOT_USED')).toBeInTheDocument();
  });

  it('writes through the element of each type', () => {
    const onSet = vi.fn();
    renderWithTheme(<ParamsetView label="Kanal" description={description} values={values} onSet={onSet} />);

    fireEvent.click(screen.getByRole('switch', { name: 'STATE' }));
    expect(onSet).toHaveBeenLastCalledWith('STATE', true);

    fireEvent.change(screen.getByRole('combobox', { name: 'MODE' }), { target: { value: '0' } });
    expect(onSet).toHaveBeenLastCalledWith('MODE', 0);

    // Levels are shown in percent and sent as 0..1, clamped to the range
    const level = screen.getByRole('textbox', { name: 'LEVEL' });
    expect(level).toHaveValue('25');
    fireEvent.change(level, { target: { value: '60' } });
    fireEvent.keyDown(level, { key: 'Enter' });
    expect(onSet).toHaveBeenLastCalledWith('LEVEL', 0.6);
    fireEvent.change(level, { target: { value: '150' } });
    fireEvent.blur(level);
    expect(onSet).toHaveBeenLastCalledWith('LEVEL', 1);

    fireEvent.click(screen.getByRole('button', { name: /Run|Ausführen/ }));
    expect(onSet).toHaveBeenLastCalledWith('PRESS', true);
  });
});
