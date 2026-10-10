import { describe, expect, it } from 'vitest';
import { Channel } from '../types/types';
// The registry first, as in the app (queries import it them)
import { controlOverrides } from './registry';
import { contactOpen, inputMode } from './InputControl';

const input = (datapoints: Record<string, unknown>, mode?: number) =>
  ({
    id: 1,
    name: 'Eingang',
    address: 'A:1',
    interfaceName: 'HmIP-RF',
    type: 'MULTI_MODE_INPUT_TRANSMITTER',
    mode,
    datapoints,
  }) as unknown as Channel;

describe('InputControl', () => {
  it('is the tile for input channels', () => {
    expect(controlOverrides.MULTI_MODE_INPUT_TRANSMITTER).toMatchObject({
      per: 'channel',
      section: 'inputs',
      component: expect.objectContaining({ tileName: 'InputControl' }),
    });
  });

  // functions.fn: without metadata "channelMode" the channel is a key
  it('takes the channel mode, key without one', () => {
    expect(inputMode(input({}))).toBe(1);
    expect(inputMode(input({}, 3))).toBe(3);
    expect(inputMode(input({}, 0))).toBe(0);
    expect(inputMode(input({}, 9))).toBe(1);
  });

  // iseButtonsDoorContact: 1, true and 200 are open, 0 and false closed
  it('reads a contact from STATE or VALUE_8BIT', () => {
    expect(contactOpen(input({ STATE: true }))).toBe(true);
    expect(contactOpen(input({ STATE: false }))).toBe(false);
    expect(contactOpen(input({ VALUE_8BIT: 200 }))).toBe(true);
    expect(contactOpen(input({ VALUE_8BIT: 0 }))).toBe(false);
    expect(contactOpen(input({ VALUE_8BIT: 57 }))).toBeUndefined();
    expect(contactOpen(input({}))).toBeUndefined();
  });
});
